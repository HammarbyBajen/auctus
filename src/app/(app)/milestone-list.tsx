import { Trophy } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { MicroLabel } from "@/components/app/micro-label";
import { Surface } from "@/components/app/surface";
import { aiEnabled } from "@/lib/ai/enabled";
import type { EmailMode } from "@/lib/email/mode";
import { formatDay, formatNumber } from "@/lib/format";
import { fillMilestone } from "@/lib/mana/milestones";
import type { MilestoneRow } from "@/lib/mana/milestones-service";
import { t, type MessageKey } from "@/lib/i18n";
import { MembersTabs, type MembersCounts } from "./at-risk-list";
import { draftForMilestone } from "./draft-actions";
import { sendMilestoneEmail } from "./email-actions";
import { markMilestone } from "./milestone-actions";
import { MilestonePanels } from "./milestone-panels";

/** Medlemmar → Milstolpar (ticket 35): members who reached a milestone, newest first, with the owners' message ready. */
export function MilestoneList({ rows, scope, counts, emailMode }: { rows: MilestoneRow[]; scope: "all" | "mine"; counts: MembersCounts; emailMode: EmailMode }) {
  const assistantOn = aiEnabled();
  return (
    <div id="hor-av-dig" className="flex min-w-0 scroll-mt-20 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <MicroLabel as="h3">
          <span id="milestones">{t("milestones.title")}</span>
        </MicroLabel>
        <p className="text-xs text-muted-foreground">{t("milestones.intro")}</p>
      </div>
      <MembersTabs scope={scope} filter="milestones" counts={counts} />
      {rows.length === 0 ? (
        <p className="rounded-lg bg-well px-4 py-6 text-sm text-muted-foreground">{t("milestones.empty")}</p>
      ) : (
        <Surface as="div" className="overflow-hidden" aria-labelledby="milestones">
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const name = row.name ?? row.email ?? t("atRisk.noName");
              const milestone = t(`milestones.kind.${row.kind}` as MessageKey, { n: formatNumber(row.threshold) });
              return (
                <li key={row.id} className="flex flex-col gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium break-words">{name}</p>
                      <Chip tone="success" icon={Trophy}>
                        {milestone}
                      </Chip>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("milestones.reached", { date: formatDay(row.reachedOn) })}
                      {row.memberships.length > 0 ? ` · ${row.memberships.join(", ")}` : ""}
                    </p>
                  </div>
                  <MilestonePanels
                    id={`milestone-${row.id}`}
                    name={name}
                    phone={row.phone}
                    email={
                      row.email
                        ? {
                            to: row.email,
                            subject: fillMilestone(row.template.subject, row.name, row.threshold),
                            body: fillMilestone(row.template.body, row.name, row.threshold),
                            mode: emailMode,
                            action: sendMilestoneEmail.bind(null, row.id),
                            draft: assistantOn ? draftForMilestone.bind(null, row.id) : undefined,
                          }
                        : null
                    }
                    doneAction={markMilestone.bind(null, row.id, "done")}
                    skipAction={markMilestone.bind(null, row.id, "skipped")}
                  />
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}
