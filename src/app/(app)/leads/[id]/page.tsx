import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Mail, MessageSquare, Phone, PhoneCall } from "lucide-react";
import { db } from "@/db";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Chip } from "@/components/app/chip";
import { ConfirmButton } from "@/components/app/confirm-button";
import { MicroLabel } from "@/components/app/micro-label";
import { NativeSelect } from "@/components/app/native-select";
import { Notice } from "@/components/app/notice";
import { Stagger, StaggerItem } from "@/components/app/stagger";
import { Panel } from "@/components/app/surface";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime, formatDay } from "@/lib/format";
import { isWinBackSource } from "@/lib/leads/constants";
import { getLead, type HistoryItem } from "@/lib/leads/service";
import { getManaInfo } from "@/lib/mana/leads";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { listColdReasons, listStages, listWinBackReasons } from "@/lib/pipeline/service";
import { dueState, isGreyedOut, todayInStockholm } from "@/lib/tasks/dates";
import { listStudioUsers, listTasksForLead } from "@/lib/tasks/service";
import { requirePermission } from "@/lib/session";
import { t, type MessageKey } from "@/lib/i18n";
import { assignAction, finishTask, logContactAction, moveStage, removeTask, saveWinBackReason } from "../actions";
import { ManaRefresher } from "./mana-refresher";
import { NoteForm } from "./note-form";
import { TaskForm } from "./task-form";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dubblett?: string; fel?: string }>;
}) {
  const user = await requirePermission("leads", "read");
  const { id } = await params;
  const { dubblett, fel } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getLead(db, user.studioId, id);
  if (!found) notFound();
  const { lead, person, stage, assigneeName, history } = found;
  const today = todayInStockholm();
  const [stages, reasons, taskLists, people, mana, winBackReasons] = await Promise.all([
    listStages(db, user.studioId),
    listColdReasons(db, user.studioId),
    listTasksForLead(db, user.studioId, lead.id),
    listStudioUsers(db, user.studioId),
    getManaInfo(db, user.studioId, person.manaUserId),
    listWinBackReasons(db, user.studioId),
  ]);
  const winBack = isWinBackSource(lead.source);
  const stageName = (key: string | null) => stages.find((s) => s.key === key)?.name ?? key ?? "";
  const reasonName = (key: string | null) => reasons.find((r) => r.key === key)?.name ?? key ?? "";
  const coldStages = stages.filter((s) => s.kind === "cold");
  const move = moveStage.bind(null, lead.id);
  const log = logContactAction.bind(null, lead.id);
  const phoneHref = person.phone ? `tel:${person.phone.replace(/[^\d+]/g, "")}` : null;
  const alreadyMember = Boolean(mana && mana.counting.length > 0 && stage.kind !== "won" && !winBack);
  const source = t(`source.${lead.source}` as MessageKey) || t("source.unknown");

  return (
    <Stagger className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <ManaRefresher leadId={lead.id} />
      <StaggerItem className="lg:hidden">
        <ButtonLink href="/leads" variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft aria-hidden="true" />
          {t("leads.back")}
        </ButtonLink>
      </StaggerItem>

      {/* Hero: who the person is, where they are, and the way to reach them. */}
      <StaggerItem className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight break-words">{person.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {stage.kind === "won" ? (
              <Chip tone="success" icon={CheckCircle2}>
                {stage.name}
              </Chip>
            ) : (
              <span className="font-medium text-foreground">{stage.name}</span>
            )}
            <span aria-hidden="true">·</span>
            <span>{source}</span>
            {lead.assignedToId && assigneeName && (
              <>
                <span aria-hidden="true">·</span>
                <span>{t("assign.assignedTo", { name: assigneeName })}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {phoneHref && (
            <ButtonAnchor href={phoneHref} size="lg">
              <Phone aria-hidden="true" />
              {t("lead.call")} <span className="tabular-nums">{person.phone}</span>
            </ButtonAnchor>
          )}
          {person.email && (
            <ButtonAnchor href={`mailto:${person.email}`} size="lg" variant="outline">
              <Mail aria-hidden="true" />
              {t("lead.mail")}
            </ButtonAnchor>
          )}
        </div>
        {person.email && <p className="text-sm break-all text-muted-foreground">{person.email}</p>}
        {!person.phone && !person.email && <Notice tone="warning">{t("lead.noContact")}</Notice>}
      </StaggerItem>

      {(dubblett === "1" || fel === "anledning" || isGreyedOut(lead.assignedToId, user.id) || alreadyMember) && (
        <StaggerItem className="flex flex-col gap-2">
          {dubblett === "1" && <Notice tone="warning">{t("leadForm.duplicate")}</Notice>}
          {fel === "anledning" && <Notice tone="danger">{t("lead.errorReason")}</Notice>}
          {isGreyedOut(lead.assignedToId, user.id) && <Notice>{t("assign.notice", { name: assigneeName ?? "" })}</Notice>}
          {alreadyMember && <Notice tone="warning">{t("lead.manaAlready")}</Notice>}
        </StaggerItem>
      )}

      {winBack && (
        <StaggerItem>
          <Panel title={t("winback.title")} id="winback">
            <form action={saveWinBackReason.bind(null, lead.id)} className="flex flex-col gap-4">
              {lead.winBackReason ? (
                <p className="text-sm">
                  {t("winback.current", { reason: winBackReasons.find((r) => r.key === lead.winBackReason)?.name ?? lead.winBackReason })}
                </p>
              ) : (
                <Notice tone="warning">{t("winback.prompt")}</Notice>
              )}
              {fel === "vinnanledning" && <Notice tone="danger">{t("winback.error")}</Notice>}
              <RadioGroup name="reason" defaultValue={lead.winBackReason ?? undefined} required className="gap-0">
                {winBackReasons.map((r) => (
                  <Label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent">
                    <RadioGroupItem value={r.key} />
                    {r.name}
                  </Label>
                ))}
              </RadioGroup>
              <SubmitButton className="self-start">{t("winback.save")}</SubmitButton>
            </form>
          </Panel>
        </StaggerItem>
      )}

      <StaggerItem>
        <Panel title={t("lead.contactTitle")} id="contact">
          <form action={log} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {contactOutcomes.map((outcome) => (
              <SubmitButton key={outcome} keepLabel variant="outline" name="outcome" value={outcome}>
                {t(`outcome.${outcome}` as MessageKey)}
              </SubmitButton>
            ))}
          </form>
        </Panel>
      </StaggerItem>

      <StaggerItem>
        <Panel title={t("lead.moveTo")} id="move">
          <div className="flex flex-wrap gap-2">
            {stages
              .filter((s) => s.kind !== "cold" && s.key !== lead.stage)
              .map((s) => (
                <form key={s.key} action={move}>
                  <input type="hidden" name="stage" value={s.key} />
                  <SubmitButton variant={s.kind === "won" ? "default" : "outline"} pendingLabel={t("lead.moving")}>
                    {s.name}
                  </SubmitButton>
                </form>
              ))}
          </div>
          {coldStages
            .filter((s) => s.key !== lead.stage)
            .map((s) => (
              <details key={s.key} className="rounded-md bg-well">
                <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium hover:bg-accent">
                  {s.name}
                </summary>
                <form action={move} className="flex flex-col gap-3 p-3">
                  <input type="hidden" name="stage" value={s.key} />
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-2 text-sm font-medium">{t("lead.coldReasonLabel")}</legend>
                    <RadioGroup name="coldReason" required className="gap-0">
                      {reasons.map((r) => (
                        <Label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal hover:bg-accent">
                          <RadioGroupItem value={r.key} />
                          {r.name}
                        </Label>
                      ))}
                    </RadioGroup>
                  </fieldset>
                  <SubmitButton className="self-start">{t("lead.coldSubmit")}</SubmitButton>
                </form>
              </details>
            ))}
        </Panel>
      </StaggerItem>

      <StaggerItem>
        <Panel title={t("task.title")} id="tasks">
          <TaskForm leadId={lead.id} today={today} />
          {taskLists.open.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("task.noOpen")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {taskLists.open.map((task) => {
                const state = dueState(task.dueDate, today);
                return (
                  <li key={task.id} className="flex flex-col gap-2 rounded-md bg-well px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-sm break-words">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {state === "overdue" ? (
                          <Chip tone="destructive" icon={AlertCircle}>
                            {t("task.overdue")} · {formatDay(task.dueDate)}
                          </Chip>
                        ) : state === "today" ? (
                          <Chip tone="warning" icon={Clock}>
                            {t("task.today")}
                          </Chip>
                        ) : (
                          <span className="tabular-nums">{formatDay(task.dueDate)}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <form action={finishTask.bind(null, lead.id, task.id, true)}>
                        <SubmitButton size="sm" variant="secondary">
                          {t("task.done")}
                        </SubmitButton>
                      </form>
                      <form action={removeTask.bind(null, lead.id, task.id)}>
                        <ConfirmButton size="sm" variant="ghost" confirmLabel={t("task.confirmDelete")}>
                          {t("task.delete")}
                        </ConfirmButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {taskLists.done.length > 0 && (
            <details>
              <summary className="focus-ring min-h-11 cursor-pointer rounded-md py-2 text-sm text-muted-foreground hover:text-foreground">
                {t("task.doneTitle")}
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {taskLists.done.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 px-3 text-sm text-muted-foreground">
                    <span className="min-w-0">
                      <span className="break-words line-through">{task.title}</span>
                      {task.doneAt && <span className="block text-xs">{t("task.doneBy", { when: formatDateTime(task.doneAt) })}</span>}
                    </span>
                    <form action={finishTask.bind(null, lead.id, task.id, false)}>
                      <SubmitButton size="sm" variant="ghost">
                        {t("task.undo")}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
      </StaggerItem>

      <StaggerItem>
        <Panel title={t("lead.mana")} id="mana">
          {!mana ? (
            <p className="text-sm text-muted-foreground">{t("lead.manaNone")}</p>
          ) : mana.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lead.manaNoMembership")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {mana.memberships.map((m) => (
                <li key={m.id} className="flex flex-col gap-1 rounded-md bg-well px-3 py-2">
                  <p className="text-sm font-medium">
                    {m.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{t(`mstatus.${m.status}` as MessageKey)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {m.status === "future"
                      ? t("lead.manaStarts", { date: formatDay(m.startDate) })
                      : m.status === "ended"
                        ? m.pendingChangeDate
                          ? t("lead.manaEnded", { date: formatDay(m.pendingChangeDate) })
                          : t("mstatus.ended")
                        : t("lead.manaSince", { date: formatDay(m.startDate) })}
                    {m.status !== "ended" && m.pendingChangeKind === "cancel" && m.pendingChangeDate
                      ? ` · ${t("lead.manaCancel", { date: formatDay(m.pendingChangeDate) })}`
                      : ""}
                    {m.pendingChangeKind === "freeze" && m.pendingChangeDate
                      ? ` · ${t("lead.manaFreeze", { date: formatDay(m.pendingChangeDate) })}`
                      : ""}
                  </p>
                  {!mana.ignored.includes(m.membershipId) ? null : <p className="text-xs text-muted-foreground">{t("lead.manaNotCounted")}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </StaggerItem>

      <StaggerItem>
        <Panel title={t("assign.title")} id="assign">
          <form action={assignAction.bind(null, lead.id)} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Label htmlFor="assignee" className="sr-only">
              {t("assign.title")}
            </Label>
            <NativeSelect id="assignee" name="assignee" defaultValue={lead.assignedToId ?? ""} className="sm:max-w-xs">
              <option value="">{t("assign.none")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <SubmitButton variant="outline">{t("assign.save")}</SubmitButton>
          </form>
        </Panel>
      </StaggerItem>

      <StaggerItem>
        <Panel title={t("lead.notes")} id="history">
          <NoteForm leadId={lead.id} />
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("lead.noNotes")}</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {history.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex gap-3">
                  <HistoryIcon item={item} />
                  <div className="min-w-0 flex-1">
                    <HistoryLine item={item} stageName={stageName} reasonName={reasonName} />
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {item.authorName ? `${item.authorName} · ` : ""}
                      {formatDateTime(item.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </StaggerItem>

      <StaggerItem>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-1 text-sm">
          <MicroLabel as="dt" className="self-center">
            {t("lead.source")}
          </MicroLabel>
          <dd>{source}</dd>
          <MicroLabel as="dt" className="self-center">
            {t("lead.created")}
          </MicroLabel>
          <dd className="tabular-nums">{formatDateTime(lead.createdAt)}</dd>
          {lead.coldReason && (
            <>
              <MicroLabel as="dt" className="self-center">
                {t("lead.stage")}
              </MicroLabel>
              <dd>{t("lead.coldWhy", { reason: reasonName(lead.coldReason) })}</dd>
            </>
          )}
        </dl>
      </StaggerItem>
    </Stagger>
  );
}

function HistoryIcon({ item }: { item: HistoryItem }) {
  const Icon = item.kind === "note" ? MessageSquare : item.kind === "contact_logged" ? PhoneCall : ArrowRight;
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-well text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

function HistoryLine({
  item,
  stageName,
  reasonName,
}: {
  item: HistoryItem;
  stageName: (key: string | null) => string;
  reasonName: (key: string | null) => string;
}) {
  if (item.kind === "note") return <p className="text-sm break-words whitespace-pre-wrap">{item.body}</p>;
  if (item.kind === "contact_logged") {
    return <p className="text-sm">{t("history.contact", { outcome: t(`outcome.${item.outcome}` as MessageKey) })}</p>;
  }
  return (
    <div className="text-sm">
      <p>
        {item.fromStage
          ? t("history.stageChanged", { from: stageName(item.fromStage), to: stageName(item.toStage) })
          : t("history.stageStart", { to: stageName(item.toStage) })}
      </p>
      {item.coldReason && <p className="text-muted-foreground">{t("history.coldBecause", { reason: reasonName(item.coldReason) })}</p>}
      {item.via === "mana" && <p className="text-muted-foreground">{t("history.viaMana")}</p>}
    </div>
  );
}
