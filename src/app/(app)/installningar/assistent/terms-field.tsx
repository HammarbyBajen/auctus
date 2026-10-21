"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { healthMatch, withoutContactDetails } from "@/lib/ai/privacy";
import { t } from "@/lib/i18n";

/**
 * The studio's own health words, and a box to try a note against them and the
 * built-in ones, before or after saving: the filter runs here exactly as it
 * does before anything is sent.
 */
export function TermsField({ initial }: { initial: string[] }) {
  const [terms, setTerms] = useState(initial.join("\n"));
  const [note, setNote] = useState("");
  const words = terms.split(/[\n,]+/);
  const match = note.trim() ? healthMatch(note, words) : null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-terms">{t("ai.termsLabel")}</Label>
        <Textarea
          id="ai-terms"
          name="terms"
          rows={4}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          aria-describedby="ai-terms-hint"
          className="max-w-md"
        />
        <p id="ai-terms-hint" className="text-xs text-muted-foreground">
          {t("ai.termsHint")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-test">{t("ai.testLabel")}</Label>
        <p id="ai-test-hint" className="max-w-md text-xs text-muted-foreground">
          {t("ai.testHint")}
        </p>
        <Textarea
          id="ai-test"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("ai.testPlaceholder")}
          aria-describedby="ai-test-hint"
          className="max-w-md"
        />
        <div aria-live="polite" className="max-w-md text-sm">
          {note.trim() &&
            (match ? (
              <p className="font-medium text-destructive">{t("ai.testHeld", { word: match.word, term: match.term })}</p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="font-medium text-success">{t("ai.testSent")}</p>
                <p className="rounded-md bg-well px-3 py-2 break-words whitespace-pre-wrap text-muted-foreground">{withoutContactDetails(note)}</p>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
