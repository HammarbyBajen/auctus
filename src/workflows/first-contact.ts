import { sleep } from "workflow";
import { db } from "@/db";
import { firstContactState, notifyOverdue } from "@/lib/notify/service";

async function checkStep(studioId: string, leadId: string) {
  "use step";
  return firstContactState(db, studioId, leadId);
}

async function notifyStep(studioId: string, leadId: string) {
  "use step";
  const result = await notifyOverdue(db, studioId, leadId);
  // A failed post is tried again by the runtime; it is claimed only once it went through.
  if (result === "failed") throw new Error("Kunde inte posta till Discord.");
  return result;
}

/**
 * Started when a new lead comes in. Sleeps until the lead's first-contact
 * deadline (no cost while it sleeps; Hobby crons run only once a day, so they
 * could not catch this in time), then checks again: if nobody has moved the
 * lead on, it posts to Discord once. A deadline that moved later (a changed
 * limit, a day off) is slept on again.
 */
export async function firstContactWorkflow(studioId: string, leadId: string) {
  "use workflow";
  for (let round = 0; round < 10; round++) {
    const state = await checkStep(studioId, leadId);
    if (state.state === "waiting") {
      // A minute past the deadline, so the check sees it as passed.
      await sleep(new Date(new Date(state.until).getTime() + 60_000));
      continue;
    }
    if (state.state === "overdue") return notifyStep(studioId, leadId);
    return state.state;
  }
  return "gave_up";
}
