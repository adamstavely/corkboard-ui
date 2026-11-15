import { HttpErrorResponse } from '@angular/common/http';
import { Component, type ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Icon, type IconName } from '../../shared/icon';
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
import { facilitationControllerSetPrivacy } from '../../api/generated/fn/facilitation/facilitation-controller-set-privacy';
import { feedbackControllerAnswerPoll } from '../../api/generated/fn/feedback/feedback-controller-answer-poll';
import { facilitationControllerAnswerPoll } from '../../api/generated/fn/facilitation/facilitation-controller-answer-poll';
import { facilitationControllerEndPoll } from '../../api/generated/fn/facilitation/facilitation-controller-end-poll';
import { facilitationControllerStartPoll } from '../../api/generated/fn/facilitation/facilitation-controller-start-poll';
import { formatRemaining, pollTally, ranking, type Agenda, type Poll, type Breakouts, type Facilitator, type Timer, type Voting, type Writing } from './facilitation';

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
/** The tools in the facilitator's dock, each opening its setup over it; the room (lead, private mode, parking lot) comes last. */
type DockTool = 'timer' | 'vote' | 'poll' | 'writing' | 'breakouts' | 'room';
const TOOLS: { id: Exclude<DockTool, 'room'>; label: string; icon: IconName }[] = [
  { id: 'timer', label: 'Timer', icon: 'timer' },
  { id: 'vote', label: 'Dot voting', icon: 'vote' },
  { id: 'poll', label: 'Poll', icon: 'poll' },
  { id: 'writing', label: 'Hidden writing', icon: 'hidden' },
  { id: 'breakouts', label: 'Breakouts', icon: 'users' },
];

/** "Time's up" stays this long after the timer runs out. */
const TIMES_UP_MS = 60_000;

/**
 * What the facilitator runs. What's live (the shared timer, a round of dot voting and its results, hidden writing,
 * breakouts, who's presenting) shows along the top of the board for everyone. The facilitator's tools sit in a dock along
 * the bottom, each opening its setup over it, and the agenda in a run sheet on the right. Updaters and owners start and
 * stop things; everyone sees them.
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
  /** On a participant's view of the board (from outside the team): they answer polls as a participant. */
  readonly participant = input(false);
  /** Private mode: pointers, selections and names hidden. */
  readonly privacy = input<{ on: boolean; by: string }>({ on: false, by: '' });
  /** The poll, if there is one, and everyone's answers to it. */
  readonly poll = input<Poll | null>(null);
  readonly pollAnswers = input<ReadonlyMap<string, number>>(new Map());
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

  protected readonly tools = TOOLS;
  /** The dock tool whose setup is open, if any, and whether the run sheet is. */
  protected readonly tool = signal<DockTool | null>(null);
  protected readonly sheetOpen = signal(false);
  private readonly pop = viewChild<ElementRef<HTMLElement>>('pop');
  /** Which dock tools have something under way, to mark them. */
  protected readonly live = computed<Record<DockTool, boolean>>(() => ({
    timer: this.timerShown(),
    vote: this.voting().open,
    poll: !!this.poll()?.open,
    writing: this.writing().open,
    breakouts: this.breakouts().open,
    room: this.privacy().on || this.facilitating(),
  }));

  protected toolLabel(tool: DockTool): string {
    return tool === 'room' ? 'Room' : TOOLS.find((t) => t.id === tool)!.label;
  }

  protected toolIcon(tool: DockTool): IconName {
    return tool === 'room' ? 'facilitator' : TOOLS.find((t) => t.id === tool)!.icon;
  }

  /** Opens a tool's setup over the dock, or closes it if it's open. */
  protected openTool(tool: DockTool): void {
    this.problem.set('');
    this.tool.update((open) => (open === tool ? null : tool));
  }

  /** Closes the tool's setup and puts focus back on its button in the dock. */
  protected closeTool(): void {
    const tool = this.tool();
    this.tool.set(null);
    if (tool) document.querySelector<HTMLElement>(`[data-dock-tool="${tool}"]`)?.focus();
  }

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
    // A tool's setup takes focus as it opens, so Escape closes it and Tab goes through it.
    effect(() => this.pop()?.nativeElement.focus());
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
      this.privacy().on ||
      !!this.poll() ||
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

  protected async setPrivacy(on: boolean): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerSetPrivacy, { id: this.boardId(), body: { on } }));
  }

  // ── Polls ──

  protected readonly pollKinds = [
    { value: 'choice', label: 'A question with options' },
    { value: 'fist', label: 'Fist to five: 0 to 5 fingers' },
  ];
  protected readonly fingers = [0, 1, 2, 3, 4, 5];
  protected readonly fingerHints = ['No way', 'Serious doubts', 'Some doubts', 'Okay', 'Good', 'Fully in'];
  protected readonly pollQuestion = signal('');
  protected readonly pollKind = signal<'choice' | 'fist'>('choice');
  protected readonly pollOptions = signal<string[]>(['', '']);
  protected readonly myAnswer = computed(() => (this.meId() ? this.pollAnswers().get(this.meId()!) : undefined));
  protected readonly answered = computed(() => this.pollAnswers().size);
  /** The result, once the poll is closed: each answer with its count and share of the most given. */
  protected readonly pollResult = computed(() => {
    const poll = this.poll();
    if (!poll || poll.open) return [];
    const tally = pollTally(poll, this.pollAnswers());
    const most = Math.max(1, ...tally);
    return tally.map((count, i) => ({ label: poll.kind === 'fist' ? `${i}` : poll.options[i], hint: poll.kind === 'fist' ? this.fingerHints[i] : '', count, share: count / most }));
  });
  protected readonly pollAverage = computed(() => {
    const poll = this.poll();
    const answers = [...this.pollAnswers().values()];
    return poll?.kind === 'fist' && answers.length ? (answers.reduce((a, b) => a + b, 0) / answers.length).toFixed(1) : null;
  });
  protected readonly canStartPoll = computed(
    () => !!this.pollQuestion().trim() && (this.pollKind() === 'fist' || this.pollOptions().filter((o) => o.trim()).length >= 2),
  );

  protected setPollOption(i: number, value: string): void {
    this.pollOptions.update((list) => list.map((o, at) => (at === i ? value : o)));
  }

  protected async startPoll(): Promise<void> {
    const kind = this.pollKind();
    const options = this.pollOptions().map((o) => o.trim()).filter(Boolean);
    await this.#run(async () => {
      await this.#api.invoke(facilitationControllerStartPoll, { id: this.boardId(), body: { question: this.pollQuestion().trim(), kind, ...(kind === 'choice' ? { options } : {}) } });
      this.pollQuestion.set('');
      this.pollOptions.set(['', '']);
    });
  }

  protected async endPoll(clear: boolean): Promise<void> {
    await this.#run(() => this.#api.invoke(facilitationControllerEndPoll, { id: this.boardId(), body: { clear } }));
  }

  protected async answer(n: number): Promise<void> {
    await this.#run(() =>
      this.participant()
        ? this.#api.invoke(feedbackControllerAnswerPoll, { id: this.boardId(), body: { answer: n } })
        : this.#api.invoke(facilitationControllerAnswerPoll, { id: this.boardId(), body: { answer: n } }),
    );
  }

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
