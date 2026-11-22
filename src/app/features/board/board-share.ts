import { HttpErrorResponse } from '@angular/common/http';
import { ShareLinkManager } from '@adamstavely/trenchcoat/angular/share-link-manager';
import type { ShareLinksChange } from '@adamstavely/trenchcoat/share-link-manager';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { linksControllerCreate } from '../../api/generated/fn/links/links-controller-create';
import { linksControllerList } from '../../api/generated/fn/links/links-controller-list';
import { linksControllerRevoke } from '../../api/generated/fn/links/links-controller-revoke';
import { linksControllerSetExpiry } from '../../api/generated/fn/links/links-controller-set-expiry';
import { expiryChoices, sharedUrl, shareLinks } from './share-links';
import { linksControllerEmbed } from '../../api/generated/fn/links/links-controller-embed';
import { embedUrl, iframeSnippet } from '../embed/embed-urls';
import { Icon } from '../../shared/icon';
import { BoardFeedback } from './board-feedback';
import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { DataTable } from '@adamstavely/trenchcoat/angular/data-table';
import { SharePanel } from '@adamstavely/trenchcoat/angular/share-panel';
import { Switch } from '@adamstavely/trenchcoat/angular/switch';
import type { DataColumn, DataRow } from '@adamstavely/trenchcoat/data-table';
import type { ShareRecipient, ShareSubmit } from '@adamstavely/trenchcoat/share-panel';
import { Api } from '../../api/generated/api';
import { boardsControllerMembers } from '../../api/generated/fn/boards/boards-controller-members';
import { boardsControllerSetRole } from '../../api/generated/fn/boards/boards-controller-set-role';
import { atLeast, ROLE_LABELS, ROLE_LEVELS, type Role } from '../../core/roles';
import type { BoardPolicyDto } from '../../api/generated/models/board-policy-dto';
import { SecretField } from '@adamstavely/trenchcoat/angular/secret-field';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { boardAccessOf, boardChangesOf, boardDirectoryOf, boardEntitlement } from './board-access';

const COLUMNS: DataColumn[] = [
  { key: 'name', label: 'Name', type: 'title' },
  { key: 'role', label: 'Role', type: 'tag' },
];

/**
 * Who can open this board and what each may do. Whoever the workspace's policy lets share (board owners by default)
 * changes it with Trench Coat's share panel: a role here replaces someone's workspace role on this board, and removing
 * someone keeps them out. Others see the list, and why they can't change it. Share links follow the policies too:
 * who makes them, whether they can edit, their password and how long they last.
 */
@Component({
  selector: 'app-board-share',
  imports: [SharePanel, ShareLinkManager, DataTable, Button, Switch, Select, SecretField, BoardFeedback, Icon],
  templateUrl: './board-share.html',
  styleUrl: './board-share.css',
})
export class BoardShare {

  readonly #api = inject(Api);

  readonly #links = resource({
    params: () => (this.canLinks() ? this.boardId() : undefined),
    loader: ({ params: id }) => this.#api.invoke(linksControllerList, { id }),
  });
  protected readonly links = computed(() => shareLinks(this.#links.hasValue() ? this.#links.value() : []));

  /** Whether the next link made lets people edit. */
  protected readonly editableLinks = signal(false);
  /** How long the next link lasts, in days ("" for never), as picked; the workspace's longest until something is. */
  protected readonly expiryPick = signal<string | null>(null);
  protected readonly expiries = computed(() => expiryChoices(this.policy()?.linkMaxDays ?? null));
  protected readonly expiry = computed(() => {
    const choices = this.expiries();
    const picked = this.expiryPick();
    return choices.some((c) => c.value === picked) ? picked! : (choices.at(this.policy()?.linkMaxDays ? -1 : 0)?.value ?? '');
  });
  /** The next link's password, if it's to have one. */
  protected readonly password = signal('');
  protected readonly passwordNeeded = computed(() => !!this.policy()?.linkPassword);

  protected async createLink(): Promise<void> {
    const password = this.password();
    if (this.passwordNeeded() && !password) {
      toast.error('This workspace needs a password on share links', { description: 'Type one above, then make the link.' });
      return;
    }
    try {
      const canEdit = this.editableLinks() && !this.editableRefusal();
      const days = Number(this.expiry());
      const link = await this.#api.invoke(linksControllerCreate, {
        id: this.boardId(),
        body: { canEdit, ...(days ? { expiresInDays: days } : {}), ...(password ? { password } : {}) },
      });
      await navigator.clipboard?.writeText(sharedUrl(link.token)).catch(() => undefined);
      this.password.set('');
      const who = canEdit ? 'Anyone with it can edit this board.' : 'Anyone with it can view this board.';
      toast.success('Link made and copied', { description: password ? `${who} Send the password separately.` : who });
      this.#links.reload();
    } catch (err) {
      toast.error("The link couldn't be made", { description: messageOf(err) ?? 'Try again.' });
    }
  }

  /** The embed link's page and an iframe for it, once made (or found) this time the panel is open. */
  protected readonly embed = signal<{ linkId: string; url: string; iframe: string } | null>(null);
  protected readonly embedding = signal(false);
  protected readonly embedRefusal = computed(() => (this.policy() ? this.policy()!.embeds.reason : "Embedding isn't available yet."));

  protected async makeEmbed(): Promise<void> {
    this.embedding.set(true);
    try {
      const link = await this.#api.invoke(linksControllerEmbed, { id: this.boardId() });
      const url = embedUrl(location.origin, link.token);
      this.embed.set({ linkId: link.id, url, iframe: iframeSnippet(url, this.boardName() || 'Board') });
      this.#links.reload();
    } catch (err) {
      toast.error("The embed couldn't be made", { description: messageOf(err) ?? 'Try again.' });
    } finally {
      this.embedding.set(false);
    }
  }

  protected async copy(text: string, done: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error("It couldn't be copied. Select it and copy it yourself.");
    }
  }

  protected async onLinksChange(e: CustomEvent<ShareLinksChange>): Promise<void> {
    const { change, link } = e.detail;
    try {
      if (change === 'revoke') {
        await this.#api.invoke(linksControllerRevoke, { id: this.boardId(), linkId: link.id });
        // If that was the embed's link, the code shown no longer works.
        if (this.embed()?.linkId === link.id) this.embed.set(null);
      }
      else await this.#api.invoke(linksControllerSetExpiry, { id: this.boardId(), linkId: link.id, body: { expiresAt: link.expiresAt ?? null } });
      toast.success(change === 'revoke' ? 'Link turned off' : 'Expiry changed');
    } catch (err) {
      toast.error("That didn't work", { description: messageOf(err) ?? 'Try again.' });
    } finally {
      this.#links.reload();
    }
  }

  protected onCopy(): void {
    toast.success('Link copied');
  }

  readonly boardId = input.required<string>();
  readonly boardName = input('');
  /** Your role on the board. */
  readonly role = input<Role>('reader');
  /** What the workspace's policies let you do here; until it's known, nothing beyond looking. */
  readonly policy = input<BoardPolicyDto | undefined>(undefined);
  /** Owners and the facilitator change and close the board's feedback link (opening it is the policy's call). */
  readonly canManageFeedback = input(false);

  protected readonly canShare = computed(() => !!this.policy()?.shareWithPeople.allowed);
  protected readonly shareRefusal = computed(() => this.policy()?.shareWithPeople.reason ?? null);
  protected readonly canLinks = computed(() => !!this.policy()?.shareLinks.allowed);
  protected readonly linksRefusal = computed(() => this.policy()?.shareLinks.reason ?? null);
  protected readonly editableRefusal = computed(() => this.policy()?.editableLinks.reason ?? null);
  protected readonly feedbackRefusal = computed(() => (this.policy() ? this.policy()!.feedback.reason : "This board isn't open for feedback."));
  readonly meId = input<string | undefined>(undefined);
  readonly closed = output<void>();

  protected readonly list = resource({
    params: () => this.boardId(),
    loader: ({ params: id }) => this.#api.invoke(boardsControllerMembers, { id }),
  });
  readonly #members = computed(() => (this.list.hasValue() ? this.list.value() : []));

  /** Someone sharing who isn't a board owner gives at most their own role. */
  protected readonly levels = computed(() => ROLE_LEVELS.filter((l) => this.role() === 'owner' || atLeast(this.role(), l.id)));
  protected readonly access = computed(() => boardAccessOf(this.#members(), this.meId()));
  protected readonly directory = computed(() => boardDirectoryOf(this.#members()));
  protected readonly entitled = (recipient: ShareRecipient, level: string) => boardEntitlement(this.#members(), recipient, level, this.role());

  protected readonly columns = COLUMNS;
  protected readonly rows = computed<DataRow[]>(() =>
    this.#members()
      .filter((m) => m.role !== null)
      .map((m) => ({ id: m.userId, name: m.userId === this.meId() ? `${m.name} (you)` : m.name, role: ROLE_LABELS[m.role!] })),
  );

  protected readonly sending = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected async onShare(e: CustomEvent<ShareSubmit>): Promise<void> {
    this.sending.set(true);
    this.problem.set(null);
    const failures: string[] = [];
    for (const { userId, role } of boardChangesOf(this.#members(), e.detail)) {
      try {
        await this.#api.invoke(boardsControllerSetRole, { id: this.boardId(), userId, body: { role } });
      } catch (err) {
        failures.push(messageOf(err) ?? "Something didn't save. Try again.");
      }
    }
    this.list.reload();
    this.sending.set(false);
    if (failures.length) this.problem.set(failures.join(' '));
  }
}

/** The API's reason for a refusal, when it gave one. */
function messageOf(err: unknown): string | undefined {
  const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
  return typeof message === 'string' ? message : undefined;
}
