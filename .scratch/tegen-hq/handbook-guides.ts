import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studio, user } from "@/db/schema";
import { createCategory, createPage, listCategories, listPages } from "@/lib/handbook/service";

// Handbok guides for using Tegen HQ (written 2026-10-26, approved by Max). Added to production on 2026-10-26.
// To add them again (only missing titles are added): copy to scripts/, then run with the database's env loaded and NODE_OPTIONS="--conditions=react-server".
type Block = ["h2" | "h3" | "p", string] | ["ul" | "ol" | "tasks", string[]];
const text = (t: string) => [{ type: "text", text: t }];
const para = (t: string) => ({ type: "paragraph", content: text(t) });
const node = ([kind, value]: Block) => {
  if (kind === "h2" || kind === "h3") return { type: "heading", attrs: { level: kind === "h2" ? 2 : 3 }, content: text(value as string) };
  if (kind === "p") return para(value as string);
  const items = value as string[];
  if (kind === "tasks") return { type: "taskList", content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [para(i)] })) };
  return { type: kind === "ul" ? "bulletList" : "orderedList", content: items.map((i) => ({ type: "listItem", content: [para(i)] })) };
};
const doc = (...blocks: Block[]) => ({ type: "doc", content: blocks.map(node) });

export const category = "Tegen HQ";
export const guides: [string, Block[]][] = [
  ["Börja dagen i Tegen HQ", [
    ["p", "Startsidan visar det som behöver göras i dag. Börja där varje dag du jobbar med leads."],
    ["h2", "Så här läser du startsidan"],
    ["ul", [
      "Behöver din uppmärksamhet: leads med en tid som gått ut eller går ut snart. Ta dem först.",
      "Utan nästa steg: leads som står still. Ge dem en uppgift eller flytta dem.",
      "Hör av dig till: medlemmar som inte varit här, nya medlemmar som inte kommit och milstolpar. Tryck för att öppna Medlemmar.",
    ]],
    ["h2", "Alla eller Mina"],
    ["p", "Uppe till höger väljer du Alla eller Mina. Mina visar det du är ansvarig för och det som ingen har tagit."],
  ]],
  ["Svara på en ny lead", [
    ["p", "Vi lovar att höra av oss inom 24 timmar. En ny lead hamnar i steget Ny lead och syns på startsidan tills någon tagit kontakt."],
    ["ol", [
      "Öppna leaden från startsidan.",
      "Är assistenten påslagen: tryck Förbered samtalet och läs igenom förberedelsen.",
      "Ring. Under Vad hände? skriver du en kort anteckning och trycker på det som hände: Ringde, Inget svar, Mejlade eller Bokade tid.",
      "Flytta leaden till nästa steg med knappen under Flytta till.",
      "Behöver något göras ett visst datum, lägg till en uppgift.",
    ]],
    ["h3", "Inget svar"],
    ["p", "Tryck Inget svar, skicka ett sms eller ett mejl, och lägg en uppgift om att ringa igen dagen efter."],
  ]],
  ["Stegen för en lead", [
    ["ul", [
      "Ny lead: har inte fått kontakt än.",
      "Kontaktad: vi har pratat med dem.",
      "Bokat möte eller Bokat provträning: en tid är bokad.",
      "Konsultation klar och Prisinformation: de vet vad det kostar och funderar.",
      "Medlem: flyttas dit av sig själv när de köpt ett medlemskap i Mana.",
      "Kall lead: de vill inte just nu. Välj alltid ett skäl.",
    ]],
    ["p", "Står en lead still för länge i ett steg dyker den upp under Utan nästa steg på startsidan. Gränserna för varje steg ställer ägarna in under Inställningar → Tider."],
  ]],
  ["Provträningen", [
    ["ol", [
      "Flytta leaden till Bokat provträning när en tid är bokad.",
      "Under Uppgifter frågar Tegen HQ När är provträningen? Fyll i datumet och tryck Spara.",
      "Dagen efter får du uppgiften Hör hur provträningen gick.",
      "Ring och fråga hur det kändes och vilket medlemskap som passar.",
    ]],
    ["p", "Provträningen bokas utanför Mana, så Tegen HQ kan inte själv se om de kom. Det är därför datumet behövs."],
  ]],
  ["Uppgifter och Vänta till", [
    ["p", "En uppgift är det som ska göras härnäst, med ett datum. En lead med en öppen uppgift räknas som omhändertagen och lämnar startsidan till dess."],
    ["h2", "Vänta till"],
    ["p", "När leaden själv vill höra av sig senare, eller ni väntar på svar: tryck Vänta till… under Uppgifter och välj 1 vecka, 2 veckor, 1 månad eller ett datum. Leaden kommer tillbaka som en uppgift den dagen."],
  ]],
  ["Leads från Mana", [
    ["p", "Tegen HQ läser Mana varje natt och gör en lead när någon:"],
    ["ul", [
      "säger upp sitt medlemskap,",
      "fryser sitt medlemskap,",
      "har avslutat sitt medlemskap,",
      "köper dagpass eller klippkort utan att vara medlem.",
    ]],
    ["p", "När ett klippkort nästan är slut kommer en uppgift om att erbjuda medlemskap."],
    ["h3", "Varför slutade de?"],
    ["p", "På en lead från en uppsägning, frysning eller ett avslutat medlemskap frågar Tegen HQ Varför slutade eller pausade de? Ta reda på det och välj en anledning. Mana säger inte varför."],
  ]],
  ["Medlemmar: hör av dig till", [
    ["p", "Under Medlemmar finns medlemmar som kan behöva höra av oss, i grupper:"],
    ["ul", [
      "Nya medlemmar: har inte varit här på 10 dagar sedan de började.",
      "Aldrig incheckade: har inte varit här alls sedan flytten till Mana.",
      "Slutade komma: har inte varit här på 30 dagar.",
      "Milstolpar: har nått ett antal pass eller veckor i rad.",
    ]],
    ["h2", "Så här gör du"],
    ["ol", [
      "Ring eller tryck E-post.",
      "Tryck Logga kontakt och välj Pratade med dem, Inget svar eller Mejlade eller sms:ade. Pratade med dem tar bort dem från listan.",
      "Vet ni varför de är borta, tryck Avfärda och välj Semester, Skada eller sjukdom eller Annat. Fyll gärna i Tillbaka senast.",
    ]],
    ["p", "Fördela delar ut medlemmar som ingen har tagit mellan de du bockar i."],
  ]],
  ["Milstolpar", [
    ["p", "När en medlem passerar 100, 250, 500 eller 1 000 pass, eller tränat varje vecka i 10, 26 eller 52 veckor, hamnar de under Medlemmar → Milstolpar."],
    ["ol", [
      "Tryck E-post. Ägarnas meddelande är redan ifyllt.",
      "Ändra om du vill och skicka.",
      "Har du gratulerat på annat sätt, tryck Klar. Vill du låta bli, tryck Hoppa över.",
    ]],
    ["p", "Milstolparna och meddelandena ställer ägarna in under Inställningar → Milstolpar."],
  ]],
  ["Assistenten", [
    ["p", "Assistenten föreslår, en person bestämmer. Den gör aldrig något själv."],
    ["ul", [
      "Förbered samtalet: en kort sammanfattning och en öppningsfras innan du ringer.",
      "Föreslå steg: skriv vad som hände så föreslår den kontakt, anteckning, uppgift och steg. Bocka i det som stämmer och tryck Spara valda.",
      "Föreslå mejl: ett utkast i Tegens ton. Läs och ändra innan du skickar.",
      "Fråga assistenten (ägare, under Rapport): frågor om leads, medlemmar och timmar.",
    ]],
    ["h3", "Det här skickas aldrig"],
    ["p", "Anteckningar med hälsouppgifter, anteckningar markerade som privata, telefonnummer och e-postadresser. Är något känsligt, bocka i Privat."],
  ]],
  ["Timmar", [
    ["p", "Under Timmar räknas coachernas timmar från Mana: pass, PT, Onramp och Kids."],
    ["ol", [
      "Välj månad och tryck Hämta från Mana.",
      "Kolla att rätt kategorier är ibockade. Dolda klasser som Tegenbutik är märkta (dold) och räknas först när de bockas i.",
      "Stäm av mot det du räknat.",
      "Tryck Lås månaden. Sedan ändras siffrorna inte längre.",
      "Exportera som Excel eller CSV till revisorn.",
    ]],
  ]],
];

(async () => {
  const [s] = await db.select({ id: studio.id }).from(studio).limit(1);
  // Written in the name of the person given by AUTHOR_EMAIL, or the first owner.
  const byEmail = process.env.AUTHOR_EMAIL ? (await db.select().from(user).where(and(eq(user.studioId, s.id), eq(user.email, process.env.AUTHOR_EMAIL))).limit(1))[0] : undefined;
  const author = byEmail ?? (await db.select().from(user).where(and(eq(user.studioId, s.id), eq(user.role, "owner"))).limit(1))[0];
  const cats = await listCategories(db, s.id);
  const cat = cats.find((c) => c.name === category) ?? (await createCategory(db, s.id, category));
  const titles = new Set((await listPages(db, s.id)).filter((p) => p.categoryId === cat.id).map((p) => p.title));
  let made = 0;
  for (const [title, blocks] of guides) {
    if (titles.has(title)) continue;
    await createPage(db, s.id, author.id, { title, categoryId: cat.id, content: doc(...blocks) });
    made++;
  }
  console.log("made", made, "guides in", category);
  process.exit(0);
})();
