import { describe, expect, it } from "vitest";
import { parseCsv, planImport, stockholmDateTime } from "@/lib/import/pipedrive";

const dealHeader =
  "Affär - ID;Affär - Namn;Affär - Pipeline;Affär - Kontaktperson;Affär - Kontaktpersonens id;Affär - Fas;Affär - Status;Affär - Affär skapad;Affär - Uppdaterat klockan;Affär - Källans ursprung;Affär - INFO";
const deal = (id: string, personId: string, fas: string, status = "Pågående", pipeline = "TEGEN SÄLJ 2026", created = "2026-09-01 10:00", origin = "Webbformulär", info = "") =>
  [id, `Affär ${id}`, pipeline, `Person ${personId}`, personId, fas, status, created, created, origin, info].join(";");
const peopleHeader = `"Person - ID","Person - Namn","Person - Telefon - Annan","Person - E-post - Arbete"`;

function plan(deals: string[], people: string[]) {
  return planImport([dealHeader, ...deals].join("\r\n"), [peopleHeader, ...people].join("\n"));
}

describe("parseCsv", () => {
  it("reads semicolons or commas, quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a;b\r\n1;"x;y"\r\n')).toEqual([{ a: "1", b: "x;y" }]);
    expect(parseCsv('"a","b"\n"say ""hi""",2\n')).toEqual([{ a: 'say "hi"', b: "2" }]);
  });
});

describe("stockholmDateTime", () => {
  it("reads Pipedrive's local time in summer and winter", () => {
    expect(stockholmDateTime("2026-07-01 12:00").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(stockholmDateTime("2026-01-15 12:00").toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });
});

describe("planImport", () => {
  it("imports only open deals in the sales pipeline, with mapped stages", () => {
    const result = plan(
      [
        deal("1", "p1", "NYA LEADS"),
        deal("2", "p2", "BOKAT MÖTE", "Vunnen"),
        deal("3", "p3", "PRISINFO", "Förlorad"),
        deal("4", "p4", "NY LEAD (KIDS)", "Pågående", "KIDS 2026"),
        deal("5", "p5", "AVBOKAT MÖTE"),
        deal("6", "p6", "KALL"),
        deal("7", "p7", "NYA KUNDER"),
      ],
      ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((id) => `"${id}","Namn ${id}","070-123 45 6${id.slice(1)}",""`),
    );
    expect(result.leads.map((l) => [l.ref, l.stage, l.coldReason])).toEqual([
      ["pipedrive:person:p1", "new_lead", null],
      ["pipedrive:person:p5", "contacted", null],
      ["pipedrive:person:p6", "cold", "other"],
    ]);
    expect(result.skipped).toEqual({ won: 1, lost: 1, kids: 1, unmapped_stage: 1 });
    expect(result.unmapped.stages).toEqual({ "NYA KUNDER": 1 });
  });

  it("keeps one lead per person, an open deal before a cold one", () => {
    const result = plan(
      [deal("1", "p1", "KALL", "Pågående", "TEGEN SÄLJ 2026", "2026-09-05 10:00"), deal("2", "p1", "PRISINFO", "Pågående", "TEGEN SÄLJ 2026", "2026-08-01 10:00")],
      [`"p1","Namn","","a@example.test"`],
    );
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].stage).toBe("price_info");
    expect(result.skipped).toEqual({ same_person: 1 });
  });

  it("cleans contact details, flags unknown sources and skips test leads", () => {
    const result = plan(
      [deal("1", "p1", "NYA LEADS", "Pågående", "TEGEN SÄLJ 2026", "2026-09-01 10:00", "API", "Vill börja i höst"), deal("2", "p2", "NYA LEADS")],
      [`"p1","Namn","'+46701234567, 0709999999","a@example.test, b@example.test"`, `"p2","testlead","Nej","t@example.test"`],
    );
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      phone: "+46701234567",
      email: "a@example.test",
      source: "pipedrive",
      note: "Från Pipedrive: NYA LEADS, källa API, Vill börja i höst",
    });
    expect(result.unmapped.sources).toEqual({ API: 1 });
    expect(result.skipped).toEqual({ test_lead: 1 });
  });
});
