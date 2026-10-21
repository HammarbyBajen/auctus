import { CircleCheck } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studioSettings } from "@/db/schema";
import { EmptyState } from "@/components/app/empty-state";
import { Page } from "@/components/app/page";
import { ScopeToggle } from "@/components/app/scope-toggle";
import { getEmailSettings } from "@/lib/email/service";
import { getAtRiskEmails, listAtRisk } from "@/lib/mana/at-risk-service";
import { listUsers } from "@/lib/users/service";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";
import { AtRiskList, membersHref } from "../at-risk-list";

/**
 * Members who need a word from staff (ticket 36): today the Hör av dig till
 * list (ticket 13), split into groups; training less (19), new members (34)
 * and milestones (35) join it as they are built. Members stay out of the sales
 * pipeline. Home shows a count per group that links here.
 */
export default async function MembersPage({ searchParams }: { searchParams: Promise<{ visa?: string; grupp?: string; alla?: string }> }) {
  const user = await requireUser();
  const { visa, grupp, alla } = await searchParams;
  const scope = visa === "mina" ? "mine" : "all";
  const filter = grupp === "aldrig" ? "never" : grupp === "borta" ? "away" : "all";
  const [rows, [settings], people, emails, emailSettings] = await Promise.all([
    listAtRisk(db, user.studioId),
    db.select({ atRiskDays: studioSettings.atRiskDays }).from(studioSettings).where(eq(studioSettings.studioId, user.studioId)).limit(1),
    listUsers(db, user.studioId),
    getAtRiskEmails(db, user.studioId),
    getEmailSettings(db, user.studioId),
  ]);

  return (
    <Page
      title={t("members.title")}
      description={t("members.intro")}
      actions={<ScopeToggle scope={scope} label={t("members.title")} href={(s) => membersHref({ scope: s, filter, all: false })} />}
    >
      {rows.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t("members.empty")} />
      ) : (
        <AtRiskList
          rows={rows}
          days={settings?.atRiskDays ?? 30}
          filter={filter}
          showAll={alla === "1"}
          scope={scope}
          viewerId={user.id}
          people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
          emails={emails}
          emailMode={emailSettings.mode}
        />
      )}
    </Page>
  );
}
