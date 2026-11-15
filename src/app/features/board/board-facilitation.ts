import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../shared/icon';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { Select } from '@adamstavely/trenchcoat/angular/select';
import { Api } from '../../api/generated/api';
import { facilitationControllerSetTimer } from '../../api/generated/fn/facilitation/facilitation-controller-set-timer';
import { facilitationControllerSetVoting } from '../../api/generated/fn/facilitation/facilitation-controller-set-voting';
import { facilitationControllerEndBreakouts } from '../../api/generated/fn/facilitation/facilitation-controller-end-breakouts';
import { facilitationControllerStartBreakouts } from '../../api/generated/fn/facilitation/facilitation-controller-start-breakouts';
import { writingControllerCancel } from '../../api/generated/fn/facilitation/writing-controller-cancel';
import { writingControllerReveal } from '../../api/generated/fn/facilitation/writing-controller-reveal';
import { writingControllerStart } from '../../api/generated/fn/facilitation/writing-controller-start';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { facilitationControllerClaimFacilitator } from '../../api/generated/fn/facilitation/facilitation-controller-claim-facilitator';
import { facilitationControllerReleaseFacilitator } from '../../api/generated/fn/facilitation/facilitation-controller-release-facilitator';
import { facilitationControllerGoToStep } from '../../api/generated/fn/facilitation/facilitation-controller-go-to-step';
import { facilitationControllerSetAgenda } from '../../api/generated/fn/facilitation/facilitation-controller-set-agenda';
import { formatRemaining, ranking, type Agenda, type Breakouts, type Facilitator, type Timer, type Voting, type Writing } from './facilitation';

const TIMER_MINUTES = [1, 3, 5, 10];
const STEP_MINUTES = [0, 1, 2, 3, 5, 8, 10, 15, 20, 30, 45, 60];

/** A step of the agenda while it's being edited: minutes and frame as the selects hold them. */
interface DraftStep {
  id?: string;
  title: string;
  minutes: string;
  frameId: string;
}
const VOTE_OPTIONS = [1, 2, 3, 5, 8].map((n) => ({ value: String(n), label: `${n} vote${n === 1 ? '' : 's'} each` }));
/** "Time's up" stays this long after the timer runs out. */
const TIMES_UP_MS = 60_000;

/**
 * What the facilitator runs. What's live (the shared timer, a round of dot voting and its results, hidden writing,
 * breakouts, who's presenting) shows along the top of the board for everyone; the controls that start them sit in a
 * panel docked on the right, one section each. Updaters and owners start and stop things; everyone sees them.
 */
@Component({
  selector: 'app-board-facilitation',
  imports: [Button, Select, Icon],
  templateUrl: './board-facilitation.html',
  styleUrl: './board-facilitation.css',
})
export class BoardFacilitation {
  readonly #api = inject(Api);

  readonly boardId = input.required<string>();
  readonly voting = input.required<Voting>();
  readonly votes = input.required<ReadonlyMap<string, readonly string[]>>();
  readonly timer = input.required<Timer>();
  readonly writing = input.required<Writing>();
  readonly breakouts = input.required<Breakouts>();
  /** Who holds the facilitator's seat; this person; and whether they own the board (owners can take the seat over). */
  readonly facilitator = input<Facilitator>({ userId: null, name: '' });
  /** The session's agenda: its steps and the one it's on. */
  readonly agenda = input<Agenda>({ steps: [], current: null });
  readonly meId = input<string | undefined>();
  readonly isOwner = input(false);
  /** Bring everyone to what this person is looking at. */
  readonly bringEveryone = output<void>();
  /** The frames breakouts would use: those selected, else every frame not inside another. */
  readonly breakoutFrames = input<readonly string[]>([]);
  /** Whether those are the selected frames, to say so. */
  readonly framesSelected = input(false);
  /** The board's frames, to send revealed notes into one. */
  readonly frames = input<readonly { id: string; title: string }[]>([]);
  /** This person's votes left in the running round. */
  readonly votesLeft = input(0);
  /** Whether they may start and stop the timer and votes, and whether they may vote. */
  readonly canRun = input(false);
  readonly canVote = input(false);
  /** The facilitator's controls are open. */
  readonly controlsOpen = input(false);
  /** Someone else presenting, and whether this person follows them; and whether this person presents. */
  readonly presenter = input<{ clientId: number; name: string } | null>(null);
  readonly following = input(false);
  readonly presenting = input(false);

  readonly follow = output<boolean>();
  readonly stopPresenting = output<void>();
  /** Show these notes: the top-voted ones. */
  readonly show = output<readonly string[]>();
  /** Close the facilitator's controls. */
  readonly closed = output<void>();
  /** Go to the board's parking lot, making one if there isn't one. */
  readonly parkingLot = output<void>();

  protected readonly timerMinutes = TIMER_MINUTES;
  protected readonly voteOptions = VOTE_OPTIONS;
  protected readonly votesEach = signal('3');
  protected readonly anonymous = signal(true);
  protected readonly breakoutMinutes = signal('10');
  protected readonly breakoutOptions = [
    { value: '0', label: 'No timer' },
    ...[5, 10, 15, 20, 30].map((n) => ({ value: String(n), label: `${n} min each` })),
  ];
  protected readonly into = signal('');
  protected readonly frameOptions = computed(() => [
    { value: '', label: 'Beside the board’s notes' },
    ...this.frames().map((f) => ({ value: f.id, label: `Into “${f.title || 'Untitled frame'}”` })),
  ]);
  protected readonly problem = signal('');

  /** Now, every second while a timer runs. */
  readonly #now = signal(Date.now());
  constructor() {
    effect((onCleanup) => {
      if (this.timer().endsAt === null) return;
      const tick = setInterval(() => this.#now.set(Date.now()), 250);
      onCleanup(() => clearInterval(tick));
    });
  }

  protected readonly remaining = computed(() => {
    const endsAt = this.timer().endsAt;
    return endsAt === null ? null : endsAt - this.#now();
  });
  protected readonly clock = computed(() => formatRemaining(this.remaining() ?? 0));
  protected readonly timerShown = computed(() => {
    const left = this.remaining();
    return left !== null && left > -TIMES_UP_MS;
  });
  protected readonly timesUp = computed(() => (this.remaining() ?? 1) <= 0);

  protected readonly results = computed(() => (this.voting().open ? [] : ranking(this.votes())));

  /** Something live to show along the top: the controls themselves sit in their own panel. */
  protected readonly anything = computed(
    () =>
      this.step() !== null ||
      this.timerShown() ||
      this.voting().open ||
      this.writing().open ||
      this.breakouts().open ||
      !!this.facilitator().userId ||
      this.results().length > 0 ||
      !!this.presenter() ||
      this.presenting(),
  );

  protected async startTimer(minutes: number): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerSetTimer, { id: this.boardId(), body: { seconds: minutes * 60 } }));
  }

  protected async addMinute(): Promise<void> {
    const left = Math.max(0, Math.ceil((this.remaining() ?? 0) / 1000));
    await this.#run(() =>
      this.#api.invoke(facilitationControllerSetTimer, { id: this.boardId(), body: { seconds: Math.min(3600, left + 60), label: this.timer().label } }),
    );
  }

  protected async stopTimer(): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerSetTimer, { id: this.boardId(), body: { seconds: null } }));
  }

  protected async startVote(): Promise<void> {
    await this.#run(() =>
      this.#api.invoke(facilitationControllerSetVoting, { id: this.boardId(), body: { open: true, votesEach: Number(this.votesEach()) } }),
    );
  }

  protected async finishVote(): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerSetVoting, { id: this.boardId(), body: { open: false } }));
  }

  protected async startWriting(): Promise<void> {
    await this.#run(() =>
      this.#api.invoke(writingControllerStart, { id: this.boardId(), body: { anonymous: this.anonymous(), ...(this.into() ? { frameId: this.into() } : {}) } }),
    );
  }

  protected async reveal(): Promise<void> {
    await this.#run(async () => {
      const { revealed } = await this.#api.invoke(writingControllerReveal, { id: this.boardId() });
      toast.success(`Revealed ${revealed} note${revealed === 1 ? '' : 's'}`);
    });
  }

  protected async cancelWriting(): Promise<void> {
    await this.#run(() => this.#api.invoke(writingControllerCancel, { id: this.boardId() }));
  }

  protected readonly facilitating = computed(() => !!this.meId() && this.facilitator().userId === this.meId());

  // ── The agenda ──

  protected readonly stepTimes = STEP_MINUTES.map((m) => ({ value: String(m), label: m ? `${m} min` : 'No timer' }));
  protected readonly stepFrames = computed(() => [{ value: '', label: 'No frame' }, ...this.frames().map((f) => ({ value: f.id, label: f.title || 'Untitled frame' }))]);
  /** The steps being edited, or null when not editing. */
  protected readonly drafting = signal<DraftStep[] | null>(null);
  /** Someone else holds the seat, so only they move the agenda on. */
  protected readonly othersSeat = computed(() => !!this.facilitator().userId && !this.facilitating());
  protected readonly step = computed(() => {
    const { steps, current } = this.agenda();
    return current === null ? null : { ...steps[current], index: current, count: steps.length };
  });

  protected minutesOf(seconds: number): string {
    return seconds ? `${Math.round(seconds / 60)} min` : 'No timer';
  }

  protected editAgenda(): void {
    const steps = this.agenda().steps;
    this.drafting.set(
      steps.length
        ? steps.map((s) => ({ id: s.id, title: s.title, minutes: String(Math.round(s.seconds / 60)), frameId: s.frameId ?? '' }))
        : [{ title: '', minutes: '5', frameId: '' }],
    );
  }

  protected addStep(): void {
    this.drafting.update((steps) => [...(steps ?? []), { title: '', minutes: '5', frameId: '' }]);
  }

  protected updateStep(i: number, change: Partial<DraftStep>): void {
    this.drafting.update((steps) => steps && steps.map((s, at) => (at === i ? { ...s, ...change } : s)));
  }

  protected removeStep(i: number): void {
    this.drafting.update((steps) => steps && steps.filter((_, at) => at !== i));
  }

  protected async saveAgenda(): Promise<void> {
    const steps = (this.drafting() ?? []).filter((s) => s.title.trim());
    await this.#run(async () => {
      await this.#api.invoke(facilitationControllerSetAgenda, {
        id: this.boardId(),
        body: { steps: steps.map((s) => ({ ...(s.id ? { id: s.id } : {}), title: s.title.trim(), seconds: Number(s.minutes) * 60, frameId: s.frameId || null })) },
      });
      this.drafting.set(null);
    });
  }

  /** Goes to a step: its timer starts and everyone goes to its frame. Null ends the agenda. */
  protected async goTo(step: number | null): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerGoToStep, { id: this.boardId(), body: { step } }));
  }

  protected async claim(): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerClaimFacilitator, { id: this.boardId() }));
  }

  protected async release(): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerReleaseFacilitator, { id: this.boardId() }));
  }

  protected async startBreakouts(): Promise<void> {
    const minutes = Number(this.breakoutMinutes());
    await this.#run(() =>
      this.#api.invoke(facilitationControllerStartBreakouts, { id: this.boardId(), body: { frameIds: [...this.breakoutFrames()], ...(minutes ? { minutes } : {}) } }),
    );
  }

  protected async endBreakouts(): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerEndBreakouts, { id: this.boardId() }));
  }

  protected showTop(): void {
    const top = this.results()[0]?.votes ?? 0;
    this.show.emit(this.results().filter((r) => r.votes === top).map((r) => r.id));
  }

  async #run(call: () => Promise<unknown>): Promise<void> {
    this.problem.set('');
    try {
      await call();
    } catch (err) {
      const message = err instanceof HttpErrorResponse ? (err.error as { message?: unknown } | null)?.message : undefined;
      this.problem.set(typeof message === 'string' ? message : "That didn't work. Try again.");
    }
  }
}
