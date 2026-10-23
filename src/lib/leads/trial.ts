import { daysBetween } from "./activity";
import { nextDay } from "./park";

/**
 * The trial class (ticket 33). Trials are booked outside Mana, so Tegen HQ
 * cannot see whether the lead came. Instead, staff note the trial's date when
 * the lead is at Bokat provträning, and get a task the day after to hear how
 * it went.
 */

/** The stage whose leads are asked for a trial date. */
export const trialStage = "booked_test_training";

/** How far back and ahead a trial date may be. */
const earliestDaysAgo = 14;
const latestDaysAhead = 90;

/** A trial date that makes sense: a real date, from two weeks ago to three months ahead. */
export function isTrialDay(day: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return false;
  const ahead = daysBetween(today, day);
  return ahead >= -earliestDaysAgo && ahead <= latestDaysAhead;
}

/** When to follow up: the day after the trial, or today when that has passed. */
export function trialFollowUpDay(trial: string, today: string): string {
  const after = nextDay(trial);
  return after < today ? today : after;
}

/** The earliest date the form offers. */
export const earliestTrialDay = (today: string) => {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - earliestDaysAgo)).toISOString().slice(0, 10);
};
