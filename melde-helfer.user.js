// ==UserScript==
// @name         Melde-Helfer (für Extended Admincall)
// @namespace    http://ps.addins.net/
// @version      2.4
// @description  AE-Helfer, Kommentargenerierung, Verwarntexte und Teamauswahl – läuft zusätzlich zu "Extended Admincall". Mit eigener Einstellungsseite.
// @author       Prymes
// @match        https://*.knuddels.de/ac/*
// @run-at       document-idle
// @homepageURL  https://github.com/Prymes/knuddels-melde-helfer
// @supportURL   https://github.com/Prymes/knuddels-melde-helfer/issues
// @downloadURL  https://raw.githubusercontent.com/Prymes/knuddels-melde-helfer/main/melde-helfer.user.js
// @updateURL    https://raw.githubusercontent.com/Prymes/knuddels-melde-helfer/main/melde-helfer.user.js
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

/**
 * ============================================================
 * Melde-Helfer – Tampermonkey-Version
 * ============================================================
 *
 * Läuft parallel zu "Extended Admincall" (riesaboy) und baut darauf auf:
 * - Gleiche @match-Regel, gleiche Seite.
 * - Nutzt dessen Optik (modern-button, Toasts, Tabs, Dark/Light-Stil).
 * - Eigener Menüpunkt "Melde-Helfer" mit Einstellungsseite
 *   (ac_admintoplist.pl?meldehelfer=1), analog zu den Einstellungen
 *   von Extended Admincall.
 * - Manuelle Platzhalter stehen als [Text] im Kommentar. Dadurch:
 *     - springt Alt+P (Extended Admincall) im Kommentarfeld direkt hin,
 *     - warnt die Absende-Prüfung von Extended Admincall, falls einer offen ist.
 * - Maßnahmen werden – wie in Extended Admincall – über die
 *   sanction_*-Checkboxen gelesen.
 *
 * Funktioniert auch ohne Extended Admincall, dann im hellen Stil.
 *
 * Inhalt:
 *  0. Standardwerte (Verstöße, Teams, Sanktionen, Textbausteine)
 *  1. Konfiguration laden / speichern
 *  2. Grundfunktionen
 *  3. Styles / Theme / Toast
 *  4. Seitenelemente / Meldetyp
 *  5. Gemeldeten-Daten / EMS
 *  6. Platzhalter
 *  7. Nick-Felder und Team-Auswahl
 *  8. Helfer-Box (AE-Helfer)
 *  9. Weiterleitungs-Sanktion
 * 10. Maßnahmen auslesen
 * 11. Kommentargenerierung
 * 12. Verwarntexte
 * 13. Listener
 * 14. Menüpunkt
 * 15. Einstellungsseite
 * 16. Initialisierung
 * ============================================================
 */

(function () {
  "use strict";


  /**
   * ============================================================
   * 0. Standardwerte
   * ============================================================
   *
   * Alles hier ist nur der Auslieferungszustand. Die tatsächlich
   * verwendeten Werte kommen aus der Konfiguration (Einstellungsseite).
   */


  /**
   * Meldetypen.
   * - label: Anzeige in den Einstellungen
   * - match: Erkennung im Meldetyp der Seite (Kleinschreibung)
   */
  const MELDETYPEN = [
    { key: "sexbel", label: "Sexuelle Belästigung melden", match: /sexuell/ },
    { key: "aussage", label: "Aussage melden", match: /aussage/ },
    { key: "alter", label: "Alter / Geschlecht melden", match: /alter|geschlecht/ },
    { key: "profil", label: "Profilinhalt melden", match: /profil/ },
    { key: "extrem", label: "Extremistische Aussage melden", match: /extrem/ },
    { key: "jugend", label: "Jugendgefährdende Aussage melden", match: /jugend/ },
    { key: "suizid", label: "Suizid-/Amokankündigung melden", match: /suizid|amok/ },
    { key: "spiel", label: "Spielverhalten melden", match: /spiel/ }
  ];

  /**
   * Reihenfolge der Erkennung: spezielle Typen zuerst,
   * damit z. B. "Extremistische Aussage" nicht als "Aussage" erkannt wird.
   */
  const MELDETYP_ERKENNUNG = ["extrem", "jugend", "sexbel", "suizid", "spiel", "profil", "alter", "aussage"];


  /**
   * Manuelle Platzhalter (Fallbacks), eckige Klammern für Extended Admincall.
   */
  const MANUELL = {
    anzahl: "[X]",
    verstoesse: "[Verstöße]",
    massnahmen: "[Maßnahmen]",
    nick: "[Nick]",
    meldenummer: "[Meldenummer]",
    meldetyp: "[Meldetyp]",
    empfehlung: "[Sperre]"
  };


  /**
   * Automatische Platzhalter {{NAME}} mit Beschreibung (für die Einstellungen).
   */
  const PLATZHALTER_INFO = {
    NICK: "Nick der/des Gemeldeten",
    MELDENUMMER: "Nummer der Meldung",
    MELDETYP: "Meldetyp der Meldung",
    MASSNAHMEN: "Angehakte Maßnahmen im Formular",
    VERSTOESSE: "Im Helfer ausgewählte Verstöße",
    X: "Anzahl AE-Verstöße (Auswahl im Helfer)",
    EMS: "EMS-Kontrolle (Auswahl im Helfer, sonst automatisch)",
    FREITEXT: "Freitext „Verstoß dieser Meldung“ im Helfer",
    SANKTION: "Bei Bewertung: Maßnahmen – bei Weiterleitung: Sanktionsempfehlung",
    ZIELGRUPPE: "„minderjährigen“ oder „erwachsenen“ (nach Alter der meldenden Person)",
    EMPFEHLUNG: "Im Weiterleitungs-Helfer gewählte Sperre"
  };

  const KOMMENTAR_PLATZHALTER = ["NICK", "MELDENUMMER", "MELDETYP", "MASSNAHMEN", "SANKTION", "VERSTOESSE", "FREITEXT", "X", "EMS", "ZIELGRUPPE"];
  const VERWARN_PLATZHALTER = ["NICK", "MELDENUMMER", "MELDETYP", "VERSTOESSE"];


  /**
   * Standard-Verstoßstruktur.
   * [Label, [Kinder]] = Gruppe, "Text" = Verstoß
   */
  const DEFAULT_VERSTOESSE_ROH = [
    ["ALLGEMEIN", [
      "Beleidigung / Provokation",
      "Werbung",
      "Störung des Channelklimas",
      "Öffentl. sex. / dubiose Aussagen",
      "Sex. Belästigung von Erwachsenen",
      "Dubiose Geldangebote / Finanzielles Interesse",
      "Cam-, Telefonnummer-, Bild-, Videoanfragen",
      "Fetischanfragen",
      "Inzestanfragen",
      "Veröffentlichung privater Daten",
      "Drogenverherrlichung / -verharmlosung",
      "Bettlerei",
      "Nutzung von Fremsprachen",
      "Rollenspielanfragen (mit Straftaten)",
      "Sodomie"
    ]],
    ["JUGENDSCHUTZ", [
      "Sex. Belästigung von Jugendlichen",
      "Anfragen nach Kindern",
      "Kontaktfilterumgehung"
    ]],
    ["PROFIL", [
      "Profilverstoß gegen Knigge"
    ]],
    ["SPIELE", [
      ["ALLGEMEIN", [
        "Botnutzung",
        "Teamplay",
        "Umgehen von Channelbegrenzung",
        "Nickweitergabe"
      ]],
      ["BILLARD", [
        "Billard-Betrug"
      ]],
      ["MAFIA", [
        "Absichtliches verlassen des laufenden Spiels",
        "Mafia outet sich oder Mitmaff",
        "Detektiv outet sich zu früh",
        "Unterlassene Tippabgabe",
        "Tippfake eines Bürgers",
        "Tippfake eines Detektivs",
        "Verbotener Nachtkill",
        "Sinnloser Nachtkill",
        "Provokation durch Unentschieden",
        "Aufforderung zu unerlaubten Spielaktionen",
        "Teamplay",
        "Antipathiespiel",
        "Sympathiespiel",
        "Eingreifen als tote/nicht spielende Person"
      ]],
      ["MAFIA2", [
        "Bösewicht outet sich selbst",
        "Bösewicht outet einen Mit-Bösewicht ohne besonderen Anlass",
        "Dem Tode geweihter/sterbender Bösewicht, der der letzte seiner Partei ist, outet andere Partei/Rolle",
        "Bösewicht outet sich indirekt selbst",
        "Bösewicht lässt trotz eigener Siegchance absichtlich eine andere Partei gewinnen",
        "Mafia killt im Nachtkill eigenen Mitmaff (kein Teufel/Vampir möglich)",
        "Spürnase outet ohne erkenntlichen, nachvollziehbaren Grund Bürger als Bösewicht",
        "Richter verurteilt sich aktiv selbst",
        "Weitergabe von Informationen, die nicht im Spiel weitergegeben wurden",
        "Dauerhaftes Verlassen des Spiels",
        "Teamplay",
        "Antipathiespiel",
        "Sympathiespiel",
        "Eingreifen als tote/nicht spielende Person",
        "Outen als 'negative' Partei/Rolle",
        "Absichtliche Spielverzögerungen",
        "Hetzen"
      ]],
      ["MAUMAU(X)", [
        "Teilnahme mit mehreren Nicks am selben Turnier",
        "Absichtliches, dauerhaftes aus dem Spiel fliegen",
        "Dauerhafte Spielverzögerung im MauMau Kurzturnier"
      ]],
      ["POKER", [
        "Outen der gefoldeten Karten",
        "Teilnahme mit mehreren Nicks am selben Turnier",
        "Teilnahme mit mehreren Nicks am selben Pokertisch (kein Turnier)",
        "Teamplay"
      ]],
      ["QUIZ", [
        "Überschreitung der Fragebegrenzungen",
        "Siegklau",
        "Missachtung der Punktegrenze mit Zweitnicks",
        "James rechnen oder vorsagen lassen"
      ]],
      ["WORDMIX", [
        "Dauerlösen",
        "Missachtung der Punktegrenze mit Zweitnicks",
        "Spielen in mehreren WordMix-Channels",
        "Lösungen vorsagen"
      ]]
    ]],
    ["AET", [
      "Abwertung",
      "Diskriminierung Menschen mit Behinderung",
      "Antisemitismus",
      "(Be-)Drohung",
      "Bi- / Homo- / Transfeindlichkeit",
      "Demagogie / Politisch hetzend",
      "Diskriminierung",
      "Rassismus",
      "Extremismus",
      "Gewaltverherrlichung / -Verharmlosung",
      "Kriegsverherrlichung / -verharmlosung",
      "Menschenfeindlichkeit",
      "Sexismus",
      "Verfassungsfeindlichkeit",
      "Verschwörungstheorie"
    ]]
  ];


  const DEFAULT_SANKTIONEN = [
    "Permanent", "0 Tage", "1 Tag", "3 Tage", "5 Tage", "7 Tage", "10 Tage",
    "15 Tage", "20 Tage", "30 Tage", "40 Tage", "50 Tage", "60 Tage", "90 Tage"
  ];

  const DEFAULT_EMS = [
    "keine angegeben",
    "nicht auffällig",
    "geringfügig auffällig",
    "auffällig",
    "sehr auffällig",
    "extrem auffällig"
  ];

  const DEFAULT_TEAMS = [
    ["Admin", "Chris30014"],
    ["AET", "Heiki, Allrounder2006, 1 Chris"],
    ["Bugs", "Frozen Hope"],
    ["CLT", "Anni maliisch x, carla100099"],
    ["CT", "Dytto, Chris30014, LamiKa"],
    ["Ehrenkommission", "Jag"],
    ["Forum", "Jag"],
    ["JuSchu", "Andre, Schuechterne-1989"],
    ["MyChannel", "Herrscherin des Eises, DdvOiD"],
    ["Profil", "Dragan der Schwertkämpfer, cepo, Börchen"],
    ["Smileys", "mrs fabelhaft, Palma de Mallorca Boy"],
    ["Spiele", "Candela"],
    ["Veranstaltungen", "Candela, Without a word"],
    ["VK", "Jeanny, Anni maliisch x"]
  ];

  /**
   * Anzahl AE-Verstöße (1 bis 20) – fest.
   */
  const AE_VERSTOSS_ZAHLEN = Array.from({ length: 20 }, (_, i) => String(i + 1));


  /**
   * Text der AE-Vorlage (früher fester Text des Buttons "Kommentar generieren").
   */
  const AE_KOMMENTAR_TEXT = `##_{{X}}. AE-relevanter Verstoß_

_EMS-Kontrolle:_
{{EMS}}

_Verstoß dieser Meldung:_
{{FREITEXT}}

_Zusammenfassung:_
{{VERSTOESSE}}

_Sanktion:_
{{SANKTION}}

`;


  /**
   * Kommentar-Vorlagen.
   * - zuordnung: "meldetyp|ber" oder "meldetyp|unber"
   * - auto:      beim Auswählen der Bewertung automatisch einfügen
   *              (sonst nur über den Button "Kommentar generieren")
   */
  const DEFAULT_KOMMENTARE = [
    {
      title: "AE berechtigt",
      text: AE_KOMMENTAR_TEXT,
      zuordnung: ["extrem|ber"],
      auto: false
    },
    {
      title: "UB AE",
      text: "Kein AE-Relevanter oder weiterer Verstoß feststellbar, daher UB.",
      zuordnung: ["extrem|unber"]
    },
    {
      title: "UB Sexuelle Belästigung",
      text: "Keine sexuelle Belästigung erkennbar.",
      zuordnung: ["sexbel|unber"]
    },
    {
      title: "UB Allgemein",
      text: "Kein Verstoß erkennbar.",
      zuordnung: ["aussage|unber", "alter|unber", "profil|unber", "jugend|unber", "suizid|unber", "spiel|unber"]
    },
    {
      title: "Sexuelle Belästigung (berechtigt)",
      text: "Sexuelle Belästigung von {{ZIELGRUPPE}}. [X]. Verstoß: {{SANKTION}}",
      zuordnung: ["sexbel|ber"]
    },
    {
      title: "Kommentar leeren",
      text: "",
      zuordnung: ["aussage|ber", "jugend|ber", "spiel|ber"]
    }
  ];


  /**
   * Feste Texte (nicht löschbar, nur bearbeitbar).
   */
  const FESTE_TEXTE_META = [
    {
      key: "adminAE",
      title: "Adminkommentar (AE-Meldung)",
      hint: "Button „Adminkommentar kopieren“ bei Extremistischen Aussagen.",
      placeholders: ["X", "VERSTOESSE", "MELDENUMMER", "NICK"]
    },
    {
      key: "adminAllgemein",
      title: "Adminkommentar (andere Meldetypen)",
      hint: "Button „Adminkommentar kopieren“ bei allen anderen Meldetypen.",
      placeholders: ["VERSTOESSE", "MELDENUMMER", "NICK"]
    },
    {
      key: "forwardEmpfehlung",
      title: "Weiterleitung: Sanktionsempfehlung",
      hint: "Wird als {{SANKTION}} im Weiterleitungs-Kommentar eingesetzt.",
      placeholders: ["EMPFEHLUNG"]
    },
    {
      key: "forwardPermanent",
      title: "Weiterleitung: Empfehlung bei „Permanent“",
      hint: "Ersetzt die Sanktionsempfehlung, wenn als Sperre „Permanent“ gewählt ist.",
      placeholders: []
    }
  ];

  const DEFAULT_FESTE_TEXTE = {
    adminAE: "_{{X}}. AE-Verstoß_, {{VERSTOESSE}}, _verwarnt_, {{MELDENUMMER}}",
    adminAllgemein: "{{VERSTOESSE}}, _verwarnt_, {{MELDENUMMER}}",
    forwardEmpfehlung: "Empfehle {{EMPFEHLUNG}} DP",
    forwardPermanent: "Empfehle eine Permanente Sperre"
  };


  /**
   * Verwarntexte.
   * Reihenfolge = Priorität. select bestimmt die Standard-Verstöße.
   */
  const DEFAULT_VERWARNUNGEN = [
    {
      title: "Jugendschutz",
      select: { category: "JUGENDSCHUTZ" },
      text: `Hallo {{NICK}},

du erhältst diese Verwarnung, da du mit {{VERSTOESSE}} aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Der Schutz von Kindern und Jugendlichen hat auf Knuddels höchste Priorität. Entsprechende Verstöße werden konsequent verfolgt und geahndet.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht. Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein sicheres Miteinander für alle Mitglieder gewährleistet ist.`
    },
    {
      title: "(Be-)Drohung",
      select: { labels: ["(Be-)Drohung"] },
      text: `Hallo {{NICK}},

du erhältst diese Verwarnung, da du mit einer Bedrohung oder Drohung gegenüber einem anderen Mitglied aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Drohungen und Bedrohungen gegenüber anderen Mitgliedern werden auf Knuddels nicht toleriert. Jedes Mitglied hat das Recht, sich sicher zu fühlen und frei von Einschüchterung zu kommunizieren.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht. Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein freundliches Miteinander gewährleistet ist.`
    },
    {
      title: "Kriegsverherrlichung",
      select: { labels: ["Kriegsverherrlichung / -verharmlosung"] },
      text: `Hallo {{NICK}},

du erhältst diese Verwarnung, da du mit Kriegsverherrlichung oder -verharmlosung aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Kriegsverherrlichung und -verharmlosung umfasst jede Darstellung von Krieg oder kriegerischen Handlungen, die diese als positiv, glorreich oder harmlos erscheinen lässt und das damit verbundene menschliche Leid ausblendet.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht. Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein freundliches Miteinander gewährleistet ist.`
    },
    {
      title: "Gewaltverherrlichung",
      select: { labels: ["Gewaltverherrlichung / -Verharmlosung"] },
      text: `Hallo {{NICK}},

du erhälst diese Verwarnung, da du mit Gewaltverherrlichungen aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Gewaltverherrlichung bezeichnet die Darstellung von Gewalt in einer Weise, die sie schönfärbt, verharmlost oder glorifiziert.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht. Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein freundliches Miteinander gewährleistet ist.`
    },
    {
      title: "Verschwörungstheorie",
      select: { labels: ["Verschwörungstheorie"] },
      text: `Hallo {{NICK}},

du erhälst diese Verwarnung, da du mit dem andeuten und/oder verbreiten einer Verschwörungstheorie aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Als Verschwörungstheorie wird im weitesten Sinne der Versuch bezeichnet, einen Zustand, ein Ereignis oder eine Entwicklung durch eine Verschwörung zu erklären, also durch das zielgerichtete, konspirative Wirken einer meist kleinen Gruppe von Akteuren zu einem oftmals illegalen oder illegitimen Zweck.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht. Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein freundliches Miteinander gewährleistet ist.`
    },
    {
      title: "Drogen",
      select: { labels: ["Drogenverherrlichung / -verharmlosung"] },
      text: `Hallo {{NICK}},

du erhältst diese Verwarnung, da du mit der Verherrlichung oder Verharmlosung von Drogen aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Drogenverherrlichung und -verharmlosung umfasst jede Darstellung von Drogenkonsum, die diesen als positiv, harmlos oder erstrebenswert darstellt.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht. Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein freundliches Miteinander gewährleistet ist.`
    },
    {
      title: "Spielverstoß",
      select: { category: "SPIELE" },
      text: `Hallo {{NICK}},

du erhältst diese Verwarnung, da du mit einem Spielverstoß ({{VERSTOESSE}}) aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Faire und regelkonforme Spielweise ist die Grundlage für ein angenehmes Spielerlebnis für alle Beteiligten. Verstöße gegen die Spielregeln beeinträchtigen den Spaß der gesamten Gemeinschaft.

Bitte halte dich in Zukunft an die Spielregeln sowie die AGB und Knigge, damit auch weiterhin ein faires Miteinander im Spiel gewährleistet ist.`
    },
    {
      title: "Allgemein",
      standard: true,
      text: `Hallo {{NICK}},

du erhälst diese Verwarnung, da du mit {{VERSTOESSE}} aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Dieses Verhalten spielt nicht wieder, wofür Knuddels mit seiner Philosophie und Knigge steht.
Wir heißen alle willkommen, unabhängig von Geschlecht, Persönlichkeit, Sexualität, Herkunft, Glauben oder Hintergrund. Knuddels ist offen für alle, die verstehen können, dass hinter jedem Nicknamen ein Mensch mit Gefühlen und einer eigenen Geschichte steht. Alle unsere Mitglieder verdienen einen respektvollen und wertschätzenden Umgang, ohne Vorurteile.

Bitte halte dich in Zukunft an die AGB und Knigge, damit auch weiterhin ein freundliches Miteinander gewährleistet ist.`
    },
    {
      title: "Admin-Faschismus",
      buttonMeldetypen: ["extrem"],
      text: `Hallo {{NICK}},

du erhältst diese Verwarnung, da du mit einem Vergleich der Knuddels-Administration mit faschistischen Strukturen aufgefallen bist. Der Verstoß wurde durch unser Meldesystem erfasst und dokumentiert.

Solche Vergleiche sind problematisch, da sie eine Verharmlosung von Faschismus darstellen und das historische Leid der Opfer bagatellisieren. Faschismus steht für systematische Unterdrückung, Verfolgung und Gewalt gegen Millionen von Menschen. Diese Begriffe in einem Zusammenhang mit einer Chatplattform oder deren Moderation zu verwenden, verzerrt ihre Bedeutung erheblich.

Ein solcher Vergleich widerspricht den Grundsätzen von Knuddels sowie unserem Anspruch an einen respektvollen und reflektierten Umgang miteinander.

Knuddels ist ein Ort für Offenheit und gegenseitigen Respekt – unabhängig von Geschlecht, Persönlichkeit, Sexualität, Herkunft, Glauben oder Hintergrund. Hinter jedem Nicknamen steht ein Mensch, der einen wertschätzenden Umgang verdient.

Bitte verzichte künftig auf derartige Vergleiche und achte auf eine angemessene Ausdrucksweise. Halte dich an die AGB sowie den Knigge, damit ein freundliches Miteinander gewährleistet bleibt.`
    }
  ];


  /**
   * ============================================================
   * 1. Konfiguration laden / speichern
   * ============================================================
   *
   * Aufbau:
   * - verstoesse:   Baum aus { id, label } (Verstoß) und
   *                 { id, label, children: [] } (Gruppe)
   * - sanktionen:   ["Permanent", ...]
   * - ems:          ["keine angegeben", ...]
   * - teams:        [{ id, name, leads: "Nick1, Nick2" }]
   * - kommentare:   [{ id, title, text, zuordnung: ["sexbel|ber", ...], auto }]
   * - festeTexte:   { adminAE, adminAllgemein, forwardEmpfehlung, forwardPermanent }
   * - verwarnungen: [{ id, title, text, verstoesse: [ids], standard, buttonMeldetypen: [keys] }]
   */


  const CONFIG_KEY = "meldeHelferConfig";
  const SECTIONS = ["verstoesse", "sanktionen", "ems", "teams", "kommentare", "festeTexte", "verwarnungen"];


  function uid() {
    return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const isGroup = node => Array.isArray(node.children);


  /**
   * Alle Verstöße (Blätter) eines Teilbaums.
   */
  function collectItems(nodes, out = []) {
    nodes.forEach(node => (isGroup(node) ? collectItems(node.children, out) : out.push(node)));
    return out;
  }


  /**
   * Sucht einen Knoten im Baum.
   * Rückgabe: { node, list, index, parent } oder null
   */
  function findNode(nodes, id, parent = null) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.id === id) return { node, list: nodes, index: i, parent };

      if (isGroup(node)) {
        const found = findNode(node.children, id, node);
        if (found) return found;
      }
    }
    return null;
  }


  function containsNode(node, id) {
    return isGroup(node) && node.children.some(child => child.id === id || containsNode(child, id));
  }


  /**
   * Standard-Baum mit festen IDs (Pfad), damit Verwarnungs-Zuordnungen
   * auch nach "Standard wiederherstellen" wieder passen.
   */
  function defaultVerstoesse() {
    function convert(entries, path) {
      return entries.map(entry => {
        if (Array.isArray(entry)) {
          const [label, children] = entry;
          const id = path + "/" + label;
          return { id, label, children: convert(children, id) };
        }
        return { id: path + "/" + entry, label: entry };
      });
    }
    return convert(DEFAULT_VERSTOESSE_ROH, "d:");
  }


  function resolveSelect(select, tree) {
    if (!select) return [];

    if (select.category) {
      const category = tree.find(node => isGroup(node) && node.label === select.category);
      return category ? collectItems(category.children).map(node => node.id) : [];
    }

    return collectItems(tree)
      .filter(node => select.labels.includes(node.label))
      .map(node => node.id);
  }


  function defaultSection(key, cfg) {
    switch (key) {
      case "verstoesse":
        return defaultVerstoesse();
      case "sanktionen":
        return [...DEFAULT_SANKTIONEN];
      case "ems":
        return [...DEFAULT_EMS];
      case "teams":
        return DEFAULT_TEAMS.map(([name, leads]) => ({ id: uid(), name, leads }));
      case "kommentare":
        return DEFAULT_KOMMENTARE.map(k => ({
          id: uid(),
          title: k.title,
          text: k.text,
          zuordnung: [...k.zuordnung],
          auto: k.auto !== false
        }));
      case "festeTexte":
        return { ...DEFAULT_FESTE_TEXTE };
      case "verwarnungen":
        return DEFAULT_VERWARNUNGEN.map(w => ({
          id: uid(),
          title: w.title,
          text: w.text,
          verstoesse: resolveSelect(w.select, cfg.verstoesse),
          standard: !!w.standard,
          buttonMeldetypen: [...(w.buttonMeldetypen || [])]
        }));
    }
    return null;
  }


  function loadConfig() {
    let stored = {};
    try {
      stored = JSON.parse(GM_getValue(CONFIG_KEY, "{}")) || {};
    } catch (e) {
      stored = {};
    }

    const cfg = {};
    SECTIONS.forEach(key => {
      cfg[key] = stored[key] !== undefined ? stored[key] : defaultSection(key, cfg);
    });

    migrateConfig(cfg);

    // neue feste Texte aus späteren Versionen ergänzen
    cfg.festeTexte = { ...DEFAULT_FESTE_TEXTE, ...cfg.festeTexte };

    return cfg;
  }


  /**
   * Übernimmt Einstellungen älterer Versionen.
   *
   * 2.1: Der feste Text "Kommentar generieren" (festeTexte.aeGenerator)
   *      wird zur Kommentar-Vorlage für "Extremistische Aussage / berechtigt".
   */
  function migrateConfig(cfg) {
    const alterText = cfg.festeTexte && cfg.festeTexte.aeGenerator;
    if (alterText === undefined) return;

    if (!cfg.kommentare.some(tpl => tpl.zuordnung.includes("extrem|ber"))) {
      cfg.kommentare.unshift({ id: uid(), title: "AE berechtigt", text: alterText, zuordnung: ["extrem|ber"], auto: false });
    }

    delete cfg.festeTexte.aeGenerator;
  }


  function saveConfig() {
    GM_setValue(CONFIG_KEY, JSON.stringify(CONFIG));
  }


  const CONFIG = loadConfig();


  /**
   * ============================================================
   * 2. Grundfunktionen
   * ============================================================
   */


  function normalizeSpaces(text) {
    return (text || "")
      .replace(/ /g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }


  /**
   * Ersetzt {{NAME}}-Platzhalter. Unbekannte bleiben stehen.
   */
  function fillTemplate(template, vars) {
    return (template || "").replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? "") : match
    );
  }


  /**
   * Kopiert Text in die Zwischenablage und zeigt einen Toast.
   */
  function copyToClipboard(text, message = "Text wurde in die Zwischenablage kopiert.") {
    try {
      GM_setClipboard(text, "text");
      showToast(message, text);
    } catch (e) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(message, text))
        .catch(() => showToast("Kopieren fehlgeschlagen."));
    }
  }


  /**
   * Setzt den Wert eines Feldes inklusive Events.
   * Das input-Event stößt auch das Autosave von Extended Admincall an.
   */
  function setFieldValue(field, value) {
    if (!field) return;

    field.focus();
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }


  function getUniqueNames(names) {
    const seen = new Set();
    const result = [];

    names.forEach(name => {
      const clean = normalizeSpaces(name);
      const key = clean.toLowerCase();

      if (!clean || seen.has(key)) return;

      seen.add(key);
      result.push(clean);
    });

    return result;
  }


  /**
   * Elemente erzeugen.
   * h("div", { class: "x", onclick: fn, style: {...}, dataset: {...} }, kind1, "Text", ...)
   */
  function h(tag, props, ...children) {
    const node = document.createElement(tag);

    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;

      if (key === "class") node.className = value;
      else if (key === "style") Object.assign(node.style, value);
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node[key] = value;
    });

    children.flat().forEach(child => {
      if (child === null || child === undefined || child === false) return;
      node.append(child instanceof Node ? child : String(child));
    });

    return node;
  }


  /**
   * Button im Stil von Extended Admincall.
   */
  function createButton(text, onClick, extraClass) {
    return h("button", {
      type: "button",
      class: "modern-button mh-button" + (extraClass ? " " + extraClass : ""),
      onclick: onClick
    }, text);
  }


  /**
   * ============================================================
   * 3. Styles / Theme / Toast
   * ============================================================
   *
   * Extended Admincall überschreibt beim Stilwechsel den Inhalt ALLER
   * <style>-Elemente der Seite. Deshalb wird unser Stylesheet bei
   * Bedarf neu angehängt (siehe ensureStyles).
   */


  const STYLE_MARKER = "/* melde-helfer-styles */";

  const STYLES = `${STYLE_MARKER}
    .mh-box {
      margin-top: 8px;
      margin-bottom: 8px;
      padding: 10px;
      border: 1px solid #999;
      background: #f7f7f7;
      color: #000;
      font-size: 12px;
    }
    .mh-title { font-weight: bold; margin-bottom: 6px; }
    .mh-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .mh-list {
      overflow-y: auto;
      border: 1px solid #ccc;
      background: #fff;
      padding: 6px;
      margin-bottom: 6px;
    }
    .mh-box label { display: block; margin-bottom: 4px; cursor: pointer; }
    .mh-box input[type="checkbox"] { margin-right: 6px; }
    .mh-cat {
      font-weight: bold;
      cursor: pointer;
      padding: 4px 2px;
      user-select: none;
      border-bottom: 1px solid #ddd;
      margin-bottom: 2px;
    }
    .mh-group { padding: 3px 2px; color: #555; border-bottom: 1px dotted #ccc; }
    .mh-collapsible { display: none; padding-left: 10px; margin-bottom: 4px; }
    .mh-collapsible.open { display: block; }
    .mh-warn { color: red; font-weight: bold; margin-bottom: 10px; }
    .mh-box textarea {
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 10px;
      font-size: 11px;
      font-family: Verdana, sans-serif;
    }
    .mh-button { margin-bottom: 6px; }

    /* Extended Admincall zwingt jedes div in #main auf "width: 1000px;
       margin: auto" – dadurch ragten die Boxen über die Spalte hinaus und
       verloren ihre Abstände. Für unsere Boxen hier wieder aufheben
       (!important, weil die Ursprungsregel eine sehr hohe Spezifität hat). */
    .mh-box, .mh-box div {
      width: auto !important;
      max-width: 100%;
      box-sizing: border-box;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    .mh-box { margin-top: 8px !important; margin-bottom: 8px !important; }
    .mh-box .mh-title { margin-bottom: 6px !important; }
    .mh-box .mh-row { margin-bottom: 10px !important; }
    .mh-box .mh-row > div { margin-bottom: 0 !important; }
    .mh-box .mh-list { margin-bottom: 6px !important; }
    .mh-box .mh-cat { margin-bottom: 2px !important; }
    .mh-box .mh-collapsible { margin-bottom: 4px !important; }
    .mh-box .mh-warn { margin-bottom: 10px !important; }

    /* Extended Admincall invertiert Inputs im Darkmode per Inline-Filter –
       für unsere eigenen Felder wird das hier wieder aufgehoben. */
    .mh-box input, .mh-box select,
    .mh-settings input, .mh-settings select { filter: none !important; }

    html.mh-dark .mh-box { background: #242424; border-color: #555; color: #f2f2f2; }
    html.mh-dark .mh-list { background: #1c1c1c; border-color: #444; }
    html.mh-dark .mh-box select { background: #000; color: #fff; border: 1px solid #555; }
    html.mh-dark .mh-cat { border-color: #444; }
    html.mh-dark .mh-group { color: #bbb; border-color: #444; }
    html.mh-dark .mh-warn { color: #ff6b6b; }

    /* ---------- Einstellungsseite ---------- */
    .mh-settings ul#tabs { list-style: none; padding: 0; display: flex; flex-wrap: wrap; }
    .mh-settings ul#tabs > li { display: contents; }
    .mh-settings ul#tabs > li > input { display: none; }
    .mh-settings ul#tabs > li > label { order: 1; padding: 8px; cursor: pointer; }
    .mh-settings ul#tabs > li > section { order: 2; width: 100%; display: none; box-sizing: border-box; }
    .mh-settings ul#tabs > li > input:checked ~ section { display: block; }
    .mh-settings ul#tabs > li > input:checked ~ label { font-weight: bold; }

    .mh-settings { font-size: 13px; }
    .mh-settings input[type="text"], .mh-settings textarea, .mh-settings select {
      box-sizing: border-box;
      padding: 3px 5px;
      border: 1px solid #aaa;
      border-radius: 3px;
      background: #fff;
      color: #000;
      font: inherit;
    }
    .mh-settings textarea { width: 100%; font-family: Verdana, sans-serif; font-size: 12px; resize: vertical; }
    .mh-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 6px 0 12px; }
    .mh-hint { font-size: 12px; opacity: 0.75; margin: 4px 0 8px; }
    .mh-subtitle { font-weight: bold; margin: 14px 0 6px; font-size: 14px; }
    .mh-small-title { font-weight: bold; margin: 8px 0 4px; }
    .mh-status { font-size: 12px; color: #2e9e4f; opacity: 0; transition: opacity 0.3s; }
    .mh-status.show { opacity: 1; }

    .mh-row-edit {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-top: 2px;
      padding-bottom: 2px;
      padding-right: 4px;
      border-radius: 3px;
    }
    .mh-row-edit:hover { background: rgba(175, 142, 232, 0.12); }
    .mh-row-group > input[type="text"] { font-weight: bold; }
    .mh-handle { cursor: grab; user-select: none; opacity: 0.6; padding: 0 4px; font-size: 15px; }
    .mh-iconbtn {
      cursor: pointer;
      background: none;
      border: 1px solid transparent;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 13px;
      color: inherit;
      min-width: 24px;
    }
    .mh-iconbtn:hover:not(:disabled) { border-color: #999; }
    .mh-iconbtn:disabled { opacity: 0.25; cursor: default; }
    .mh-spacer { display: inline-block; min-width: 24px; }
    .mh-grow { flex: 1; min-width: 120px; }
    .mh-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      background: #ddd;
      color: #333;
      white-space: nowrap;
    }
    .mh-drop-before { box-shadow: inset 0 3px 0 rgb(175, 142, 232); }
    .mh-drop-after { box-shadow: inset 0 -3px 0 rgb(175, 142, 232); }
    .mh-drop-inside { outline: 2px dashed rgb(175, 142, 232); }
    .mh-dragging { opacity: 0.4; }
    .mh-dropzone {
      margin-top: 6px;
      padding: 6px;
      border: 1px dashed #999;
      border-radius: 3px;
      font-size: 11px;
      opacity: 0.7;
      text-align: center;
    }

    .mh-card { border: 1px solid #bbb; border-radius: 5px; padding: 4px 8px; margin-bottom: 6px; }
    .mh-card.open { padding-bottom: 10px; margin-bottom: 12px; }
    .mh-card-head { display: flex; gap: 6px; align-items: center; min-height: 26px; }
    .mh-card-title {
      cursor: pointer;
      font-weight: bold;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      user-select: none;
    }
    .mh-card-title .mh-owner { font-weight: normal; }
    .mh-card-body { margin-top: 8px; }
    .mh-chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 4px 0 8px; }
    .mh-chip {
      cursor: pointer;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid #aaa;
      background: #eee;
      color: #000;
      font-family: monospace;
    }
    .mh-chip:hover { border-color: rgb(175, 142, 232); }
    .mh-legend td { padding: 1px 10px 1px 0; vertical-align: top; }
    .mh-matrix { border-collapse: collapse; }
    .mh-matrix th, .mh-matrix td { padding: 2px 10px 2px 0; text-align: left; }
    .mh-owner { font-size: 11px; opacity: 0.7; }
    .mh-vtree { max-height: 300px; overflow-y: auto; border: 1px solid #ccc; border-radius: 3px; padding: 6px; }
    .mh-vtree label { display: block; cursor: pointer; padding: 1px 0; }
    .mh-vtree .mh-vgroup { font-weight: bold; cursor: pointer; user-select: none; }
    .mh-inline-checks label { display: inline-block; margin-right: 14px; cursor: pointer; }
    .mh-disabled { opacity: 0.5; }

    html.mh-dark .mh-settings input[type="text"],
    html.mh-dark .mh-settings textarea,
    html.mh-dark .mh-settings select { background: #000; color: #fff; border-color: #555; }
    html.mh-dark .mh-badge { background: #444; color: #ddd; }
    html.mh-dark .mh-card { border-color: #555; }
    html.mh-dark .mh-chip { background: #333; color: #eee; border-color: #555; }
    html.mh-dark .mh-vtree { border-color: #444; }

    /* Toast – identisch zu Extended Admincall, damit es auch ohne läuft */
    #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; }
    .modern-toast {
      background: rgba(50, 50, 50, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
      margin-bottom: 10px;
      font-size: 14px;
      min-width: 250px;
      max-width: 420px;
      transform: translateX(400px);
      opacity: 0;
      transition: transform 0.4s ease-out, opacity 0.3s ease-in;
    }
    .modern-toast.visible { transform: translateX(0); opacity: 1; }
    .modern-toast.hiding { transform: translateX(400px); opacity: 0; }
    .mh-toast-preview {
      display: block;
      margin-top: 8px;
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 150px;
      overflow: hidden;
      opacity: 0.8;
    }
  `;


  /**
   * Hängt unser Stylesheet an, falls es fehlt oder überschrieben wurde.
   */
  function ensureStyles() {
    const existing = Array.from(document.querySelectorAll("style.mh-styles"));

    if (existing.some(s => (s.textContent || "").includes(STYLE_MARKER))) return;

    // Überschriebenes Element NICHT zurücksetzen – darin kann jetzt
    // das CSS von Extended Admincall stehen. Stattdessen neu anhängen.
    existing.forEach(s => s.classList.remove("mh-styles"));

    const style = h("style", { class: "mh-styles" });
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }


  /**
   * Ist Extended Admincall aktiv? Es hängt einen Changelog-Link in den Footer.
   */
  function isExtendedAdmincallActive() {
    return !!document.querySelector("#footer #changelog");
  }


  /**
   * Übernimmt den Dark/Light-Stil von Extended Admincall.
   */
  function updateTheme() {
    let style = "Dark";
    try {
      style = localStorage.getItem("reportStyle") ?? "Dark";
    } catch (e) {
      // localStorage nicht verfügbar – Standard behalten
    }

    const dark = isExtendedAdmincallActive() && style === "Dark";
    document.documentElement.classList.toggle("mh-dark", dark);
  }


  function showToast(message, preview, duration = 5000) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = h("div", { id: "toast-container" });
      document.body.appendChild(container);
    }

    const toast = h("div", { class: "modern-toast" }, message,
      preview ? h("span", { class: "mh-toast-preview" }, preview) : null);
    container.appendChild(toast);

    setTimeout(() => toast.classList.add("visible"), 100);
    setTimeout(() => {
      toast.classList.add("hiding");
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }


  /**
   * ============================================================
   * 4. Seitenelemente / Meldetyp
   * ============================================================
   */


  function getBewertenCommentField() {
    return document.getElementById("comment");
  }

  function getForwardCommentField() {
    return document.getElementById("commentArea2");
  }

  function getBewertungSelect() {
    return document.getElementById("judgement");
  }


  /**
   * "ber" / "unber" / "" je nach Bewertungsauswahl.
   */
  function getBewertungKey() {
    const select = getBewertungSelect();
    const text = select ? (select.options[select.selectedIndex]?.text || "") : "";

    if (text.includes("Unberechtigt")) return "unber";
    if (text.includes("Berechtigt")) return "ber";
    return "";
  }


  /**
   * Meldetyp als Text.
   * Zuerst aus dem typechange-Select, dann aus dem sichtbaren Seiteninhalt.
   */
  function getMeldetyp() {
    const typeChange = document.getElementById("typechange");

    if (typeChange) {
      const selected = typeChange.options[typeChange.selectedIndex];
      const text = normalizeSpaces(selected ? (selected.textContent || selected.value || "") : "");

      const match = text.match(/\(([^)]+)\)/);
      if (match && match[1]) return normalizeSpaces(match[1]);
      if (text) return text;
    }

    const rows = Array.from(document.querySelectorAll("tr"));
    for (const row of rows) {
      const text = normalizeSpaces(row.innerText || row.textContent || "");
      const match = text.match(/^Typ:\s*(.+)$/i);
      if (match && match[1]) return normalizeSpaces(match[1]);
    }

    const match = (document.body.innerText || "").match(/Typ:\s*([^\n\r]+)/i);
    return match && match[1] ? normalizeSpaces(match[1]) : "";
  }


  /**
   * Meldetyp als Schlüssel (siehe MELDETYPEN) oder "".
   */
  function getMeldetypKey() {
    const text = getMeldetyp().toLowerCase();
    if (!text) return "";

    const key = MELDETYP_ERKENNUNG.find(k => MELDETYPEN.find(t => t.key === k).match.test(text));
    return key || "";
  }


  function isAEMeldung() {
    return getMeldetypKey() === "extrem";
  }


  function isMelderUnder18() {
    const match = (document.body.innerText || "").match(/Meldende\(r\):[\s\S]*?Info:\s*(\d+)\s+Jahre/i);
    if (!match || !match[1]) return false;

    const age = parseInt(match[1], 10);
    return !isNaN(age) && age < 18;
  }


  function getMeldenummer() {
    const match = (document.body.innerText || "").match(/Meldung\s+(\*\d[\d.]*)/i);
    return match && match[1] ? match[1] : MANUELL.meldenummer;
  }


  /**
   * ============================================================
   * 5. Gemeldeten-Daten / EMS
   * ============================================================
   */


  /**
   * Nick des Gemeldeten.
   * Zuerst wie Extended Admincall: der rot markierte Nick im Kopfbereich.
   */
  function getGemeldetenNick() {
    const redSpan = Array.from(document.querySelectorAll("h3 div span"))
      .find(span => window.getComputedStyle(span).color === "rgb(153, 0, 0)");

    if (redSpan && normalizeSpaces(redSpan.textContent)) {
      return normalizeSpaces(redSpan.textContent);
    }

    const match = (document.body.innerText || "").match(/Gemeldete\(r\):\s*([^\n\r]+)/i);
    return match && match[1] ? normalizeSpaces(match[1]) : MANUELL.nick;
  }


  function clickElement(node) {
    if (!node) return false;

    try {
      node.click();
      return true;
    } catch (e) {
      try {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        return true;
      } catch (e2) {
        return false;
      }
    }
  }


  /**
   * Sucht das zweite sichtbare "mehr..." (beim Gemeldeten).
   */
  function findGemeldetenMehrLink() {
    const candidates = Array.from(document.querySelectorAll("a, span, div"))
      .filter(node => {
        const text = normalizeSpaces(node.innerText || node.textContent || "").toLowerCase();
        if (text !== "mehr...") return false;

        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;

        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

    return candidates[1] || null;
  }


  function gemeldetenDetailsSindOffen() {
    return (document.body.innerText || "").includes("E-Mail:");
  }


  /**
   * Öffnet die erweiterten Gemeldeten-Infos – nur einmal pro Seite.
   */
  let gemeldetenExpandGestartet = false;

  function ensureGemeldetenInfoExpanded() {
    if (gemeldetenExpandGestartet) return;
    gemeldetenExpandGestartet = true;

    let tries = 0;

    const interval = setInterval(() => {
      tries += 1;

      if (gemeldetenDetailsSindOffen() || tries > 10) {
        clearInterval(interval);
        return;
      }

      clickElement(findGemeldetenMehrLink());
    }, 500);
  }


  /**
   * "keine" wenn keine Mail vorhanden, sonst "DURCHFÜHREN".
   */
  function getEMSDefaultValue() {
    const text = document.body.innerText || "";

    if (text.includes("E-Mail: (keine vorhanden)")) return "keine";

    const mailMatch = text.match(/E-Mail:\s*([^\n\r]+)/i);
    if (mailMatch && mailMatch[1]) {
      const mailText = normalizeSpaces(mailMatch[1]);

      if (mailText.toLowerCase().includes("(keine vorhanden)")) return "keine";
      if (mailText.length > 0) return "DURCHFÜHREN";
    }

    return "keine";
  }


  /**
   * ============================================================
   * 6. Platzhalter
   * ============================================================
   */


  /**
   * Werte aller {{PLATZHALTER}} für den jeweiligen Helfer ("bewerten" / "forward").
   */
  function getPlaceholderValues(helperMode = "bewerten") {
    const values = getAEHelperValues(helperMode);
    const massnahmen = getSelectedActions().join(", ") || MANUELL.massnahmen;

    return {
      NICK: getGemeldetenNick(),
      MELDENUMMER: getMeldenummer(),
      MELDETYP: getMeldetyp() || MANUELL.meldetyp,
      MASSNAHMEN: massnahmen,
      VERSTOESSE: violationsText(values.violations),
      X: values.count,
      EMS: values.ems || getEMSDefaultValue(),
      FREITEXT: values.freeText,
      ZIELGRUPPE: isMelderUnder18() ? "minderjährigen" : "erwachsenen",
      EMPFEHLUNG: getForwardSanctionValue() || MANUELL.empfehlung,
      SANKTION: helperMode === "forward" ? buildForwardSanctionText() : massnahmen
    };
  }


  function violationsText(violations) {
    return violations.length ? violations.join(", ") : MANUELL.verstoesse;
  }


  /**
   * ============================================================
   * 7. Nick-Felder und Team-Auswahl
   * ============================================================
   */


  function getNickInputFields() {
    function findInputAfterLabel(labelText) {
      const xpath = `//*[contains(normalize-space(text()), "${labelText}")]`;
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

      for (let i = 0; i < result.snapshotLength; i++) {
        const labelNode = result.snapshotItem(i);
        if (!labelNode || labelNode.closest(".mh-box")) continue;

        const container = labelNode.closest("tr, td, div, form") || labelNode.parentElement;

        if (container) {
          const inputInContainer = container.querySelector("input");
          if (inputInContainer) return inputInContainer;
        }

        let current = container || labelNode.parentElement;
        let steps = 0;

        while (current && steps < 8) {
          const directInput = current.querySelector ? current.querySelector("input") : null;
          if (directInput) return directInput;

          let next = current.nextElementSibling;
          while (next) {
            const input = next.querySelector ? next.querySelector("input") : null;
            if (input) return input;
            next = next.nextElementSibling;
          }

          current = current.parentElement;
          steps += 1;
        }
      }

      return null;
    }

    return {
      forwardNickInput: findInputAfterLabel("Weiterleiten an Nicks:"),
      higherNickInput: findInputAfterLabel("Übergabe an Nicks:")
    };
  }


  function getSelectedTeamIds(mode) {
    return Array.from(document.querySelectorAll(`.melde-team-checkbox[data-team-mode="${mode}"]:checked`))
      .map(cb => cb.value);
  }


  /**
   * Übernimmt ausgewählte Teams in das passende Nick-Feld.
   */
  function applyTeamsToNickField(mode) {
    const selected = getSelectedTeamIds(mode);
    const names = getUniqueNames(
      CONFIG.teams
        .filter(team => selected.includes(team.id))
        .flatMap(team => (team.leads || "").split(","))
    );

    const { forwardNickInput, higherNickInput } = getNickInputFields();
    const target = mode === "forward" ? forwardNickInput : higherNickInput;

    setFieldValue(target, names.join(","));
  }


  function createTeamSelectionBox(id, mode) {
    const listWrap = h("div", { class: "mh-list", style: { maxHeight: "180px" } },
      CONFIG.teams.map(team => h("label", {},
        h("input", {
          type: "checkbox",
          class: "melde-team-checkbox",
          value: team.id,
          dataset: { teamMode: mode },
          onchange: () => applyTeamsToNickField(mode)
        }),
        team.name
      ))
    );

    return h("div", { class: "mh-box", id },
      h("div", { class: "mh-title" }, "Teams auswählen:"),
      listWrap,
      createButton("Auswahl in Nickfeld übernehmen", () => applyTeamsToNickField(mode))
    );
  }


  function injectTeamSelections() {
    const { forwardNickInput, higherNickInput } = getNickInputFields();

    if (forwardNickInput && !document.getElementById("melde-forward-team-box")) {
      forwardNickInput.insertAdjacentElement("afterend", createTeamSelectionBox("melde-forward-team-box", "forward"));
    }

    if (higherNickInput && !document.getElementById("melde-higher-team-box")) {
      higherNickInput.insertAdjacentElement("afterend", createTeamSelectionBox("melde-higher-team-box", "higher"));
    }
  }


  /**
   * ============================================================
   * 8. Helfer-Box (AE-Helfer)
   * ============================================================
   */


  function getAEHelperValues(helperMode) {
    const checked = Array.from(document.querySelectorAll(`.ae-violation[data-helper-mode="${helperMode}"]:checked`));

    return {
      count: document.getElementById(`ae-count-${helperMode}`)?.value || MANUELL.anzahl,
      ems: document.getElementById(`ae-ems-${helperMode}`)?.value || "",
      freeText: document.getElementById(`ae-free-text-${helperMode}`)?.value || "",
      violations: checked.map(cb => cb.value),
      violationIds: checked.map(cb => cb.dataset.id)
    };
  }


  function uncheckViolations(helperMode) {
    document.querySelectorAll(`.ae-violation[data-helper-mode="${helperMode}"]`).forEach(cb => {
      cb.checked = false;
    });
  }


  function resetAEHelperFields(helperMode, deleteFreeText) {
    const countSelect = document.getElementById(`ae-count-${helperMode}`);
    const emsSelect = document.getElementById(`ae-ems-${helperMode}`);
    const freeText = document.getElementById(`ae-free-text-${helperMode}`);

    if (countSelect) countSelect.value = "1";
    if (emsSelect) emsSelect.value = "";
    if (freeText && deleteFreeText) freeText.value = "";

    uncheckViolations(helperMode);
  }


  /**
   * Button "Kommentar generieren": nimmt immer die Kommentar-Vorlage,
   * die für Meldetyp + Bewertung eingestellt ist.
   * Ohne gewählte Bewertung und bei Weiterleitung gilt "berechtigt".
   */
  function generateAEComment(helperMode) {
    const target = helperMode === "bewerten" ? getBewertenCommentField() : getForwardCommentField();
    if (!target) return;

    const bewertung = helperMode === "bewerten" ? (getBewertungKey() || "ber") : "ber";
    const tpl = findCommentTemplate(bewertung);

    if (!tpl) {
      const typ = getMeldetyp() || "unbekannter Meldetyp";
      showToast(`Keine Kommentar-Vorlage für „${typ}“ (${bewertung === "ber" ? "berechtigt" : "unberechtigt"}). `
        + "Lege sie in den Melde-Helfer-Einstellungen im Tab Kommentar an.");
      return;
    }

    if (helperMode === "forward") {
      setForwardTeamToAdmin();
    }

    setFieldValue(target, fillTemplate(tpl.text, getPlaceholderValues(helperMode)));
  }


  /**
   * Klappbarer Abschnitt (Kategorie oder Untergruppe).
   */
  function createCollapsible(parent, label, headerClass) {
    const header = h("div", { class: headerClass }, "▶ " + label);
    const content = h("div", { class: "mh-collapsible" });

    header.addEventListener("click", () => {
      const open = content.classList.toggle("open");
      header.textContent = (open ? "▼ " : "▶ ") + label;
    });

    parent.append(header, content);
    return content;
  }


  /**
   * Verstoßbaum für den Helfer (beliebig tief).
   */
  function renderHelperTree(nodes, parent, helperMode, depth) {
    nodes.forEach(node => {
      if (isGroup(node)) {
        const content = createCollapsible(parent, node.label, depth === 0 ? "mh-cat" : "mh-cat mh-group");
        renderHelperTree(node.children, content, helperMode, depth + 1);
        return;
      }

      parent.appendChild(h("label", {},
        h("input", {
          type: "checkbox",
          class: "ae-violation",
          value: node.label,
          dataset: { helperMode, id: node.id }
        }),
        node.label
      ));
    });
  }


  function createSelect(id, values, emptyLabel) {
    const select = h("select", { id });

    if (emptyLabel !== undefined) {
      select.appendChild(h("option", { value: "" }, emptyLabel));
    }

    values.forEach(v => select.appendChild(h("option", { value: v }, v)));
    return select;
  }


  function labeled(labelText, control) {
    return h("div", {}, h("div", { class: "mh-title" }, labelText), control);
  }


  /**
   * Baut das gemeinsame Helfer-Feld.
   */
  function createUnifiedAEHelper(helperMode) {
    const box = h("div", { class: "mh-box", id: `melde-helper-unified-${helperMode}` },
      h("div", { class: "mh-title" }, isAEMeldung() ? "Melde-Helfer (AE)" : "Melde-Helfer")
    );

    // Obere Zeile (nur bei AE): Anzahl + EMS
    if (isAEMeldung()) {
      const countSelect = createSelect(`ae-count-${helperMode}`, AE_VERSTOSS_ZAHLEN);
      countSelect.value = "1";
      countSelect.style.minWidth = "120px";

      const emsSelect = createSelect(`ae-ems-${helperMode}`, CONFIG.ems, "Bitte wählen");
      emsSelect.style.minWidth = "220px";

      box.appendChild(h("div", { class: "mh-row" },
        labeled("Anzahl AE-Verstöße (X):", countSelect),
        labeled("EMS-Kontrolle:", emsSelect)
      ));

      if (getEMSDefaultValue() === "DURCHFÜHREN") {
        box.appendChild(h("div", { class: "mh-warn" }, "DURCHFÜHREN"));
      }
    }

    // Verstoßauswahl
    const listWrap = h("div", { class: "mh-list", style: { maxHeight: "320px" } });
    renderHelperTree(CONFIG.verstoesse, listWrap, helperMode, 0);

    box.append(
      h("div", { class: "mh-title" }, "Verstöße auswählen:"),
      listWrap,
      createButton("Alle abwählen", () => uncheckViolations(helperMode)),
      h("div", { class: "mh-title" }, "Verstoß dieser Meldung:"),
      h("textarea", { id: `ae-free-text-${helperMode}`, rows: 4 })
    );

    // Sanktion bei Weiterleitung
    if (helperMode === "forward") {
      const sanctionSelect = createSelect("melde-forward-sanction-select", CONFIG.sanktionen);
      sanctionSelect.style.minWidth = "220px";

      const sanctionWrap = labeled("Empfohlene Sperre:", sanctionSelect);
      sanctionWrap.style.marginBottom = "10px";
      box.appendChild(sanctionWrap);
    }

    // Hauptbuttons
    box.appendChild(h("div", { class: "mh-row" },
      createButton("Kommentar generieren", () => generateAEComment(helperMode)),
      createButton("Felder zurücksetzen", () => {
        resetAEHelperFields(helperMode, confirm("Auch den Freitext löschen?"));
      })
    ));

    // Kopierbuttons nur bei Bewertung
    if (helperMode === "bewerten") {
      const copyRow = h("div", { class: "mh-row" },
        createButton("Verwarntext kopieren", copyVerwarntext),
        createButton("Adminkommentar kopieren", () => {
          copyToClipboard(buildAdminComment(), "Adminkommentar wurde in die Zwischenablage kopiert.");
        })
      );

      // Verwarnungen mit eigenem Button
      CONFIG.verwarnungen
        .filter(tpl => (tpl.buttonMeldetypen || []).length)
        .forEach(tpl => {
          const btn = createButton(`Verwarnung „${tpl.title}“ kopieren`, () => {
            copyToClipboard(fillTemplate(tpl.text, getPlaceholderValues("bewerten")),
              "Verwarntext wurde in die Zwischenablage kopiert.");
          }, "mh-warn-button");
          btn.dataset.meldetypen = tpl.buttonMeldetypen.join(",");
          copyRow.appendChild(btn);
        });

      box.appendChild(copyRow);
    }

    return box;
  }


  function injectUnifiedAEHelper(helperMode, commentField) {
    if (document.getElementById(`melde-helper-unified-${helperMode}`)) return;
    if (!commentField || !commentField.parentElement) return;

    commentField.parentElement.insertBefore(createUnifiedAEHelper(helperMode), commentField);
  }


  function resizeAECommentFields() {
    if (!isAEMeldung()) return;

    [getBewertenCommentField(), getForwardCommentField()].forEach(field => {
      if (field && field.rows !== 20) field.rows = 20;
    });
  }


  /**
   * Eigene Verwarnungs-Buttons nur bei den eingestellten Meldetypen zeigen.
   */
  function updateActionButtonsVisibility() {
    const key = getMeldetypKey();

    document.querySelectorAll(".mh-warn-button").forEach(btn => {
      btn.style.display = (btn.dataset.meldetypen || "").split(",").includes(key) ? "" : "none";
    });
  }


  /**
   * ============================================================
   * 9. Weiterleitungs-Sanktion
   * ============================================================
   */


  function getForwardSanctionValue() {
    const select = document.getElementById("melde-forward-sanction-select");
    return select ? (select.value || "") : "";
  }


  function buildForwardSanctionText() {
    const sanction = getForwardSanctionValue();

    if (sanction.trim().toLowerCase() === "permanent") {
      return CONFIG.festeTexte.forwardPermanent;
    }

    return fillTemplate(CONFIG.festeTexte.forwardEmpfehlung, {
      EMPFEHLUNG: sanction || MANUELL.empfehlung
    });
  }


  function setForwardTeamToAdmin() {
    const select = document.getElementById("forwardteams");
    if (!select) return;

    const adminOption = Array.from(select.options || [])
      .find(opt => normalizeSpaces(opt.textContent || opt.value || "") === "Admin");
    if (!adminOption) return;

    select.value = adminOption.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }


  /**
   * ============================================================
   * 10. Maßnahmen auslesen
   * ============================================================
   */


  /**
   * Maßnahmen-Checkboxen – wie Extended Admincall über name="sanction_*".
   * Nur wenn es die nicht gibt: alle Checkboxen/Radios außerhalb des Helfers.
   */
  function getSanctionInputs() {
    const sanctionInputs = Array.from(document.querySelectorAll('input[name^="sanction_"]'))
      .filter(input => input.type === "checkbox" || input.type === "radio");

    if (sanctionInputs.length) return sanctionInputs;

    return Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'))
      .filter(input => !input.closest(".mh-box"));
  }


  function getSelectedActions() {
    const violationLabels = collectItems(CONFIG.verstoesse).map(node => node.label);
    const selected = [];

    getSanctionInputs().forEach(input => {
      if (!input.checked) return;

      let labelText = "";

      const textOf = node => (node ? (node.innerText || node.textContent || "") : "");

      if (input.id) {
        labelText = textOf(document.querySelector(`label[for="${CSS.escape(input.id)}"]`));
      }

      if (!labelText) labelText = textOf(input.closest("label"));
      if (!labelText) labelText = textOf(input.closest("td"));
      if (!labelText) labelText = textOf(input.closest("tr"));

      labelText = normalizeSpaces(labelText).replace(/Typ ist korrekt:?/gi, "").trim();

      if (!labelText || violationLabels.includes(labelText)) return;

      selected.push(labelText);
    });

    return [...new Set(selected)];
  }


  /**
   * ============================================================
   * 11. Kommentargenerierung
   * ============================================================
   *
   * Nutzt die Kommentar-Vorlage, die für Meldetyp + Bewertung
   * eingestellt ist. Ohne Vorlage passiert nichts. Vorlagen mit
   * auto = false werden nur über den Button "Kommentar generieren"
   * eingefügt.
   *
   * Die Makros von Extended Admincall setzen die Bewertung ohne
   * change-Event – deren Kommentare werden also nicht überschrieben.
   */


  function findCommentTemplate(bewertung = getBewertungKey()) {
    const meldetyp = getMeldetypKey();
    if (!meldetyp || !bewertung) return null;

    return CONFIG.kommentare.find(tpl => tpl.zuordnung.includes(`${meldetyp}|${bewertung}`)) || null;
  }


  /**
   * onlyIfUsesSanctions: Bei Änderungen an den Maßnahmen nur neu
   * erzeugen, wenn die Vorlage die Maßnahmen überhaupt enthält.
   */
  function generateComment(onlyIfUsesSanctions) {
    const textarea = getBewertenCommentField();
    if (!textarea) return;

    updateActionButtonsVisibility();

    const tpl = findCommentTemplate();
    if (!tpl || tpl.auto === false) return;

    if (onlyIfUsesSanctions === true && !/\{\{(MASSNAHMEN|SANKTION)\}\}/.test(tpl.text)) return;

    setFieldValue(textarea, fillTemplate(tpl.text, getPlaceholderValues("bewerten")));
  }


  /**
   * ============================================================
   * 12. Verwarntexte
   * ============================================================
   */


  /**
   * Erste Vorlage (Reihenfolge = Priorität), die einen der gewählten
   * Verstöße enthält – sonst die Standardvorlage.
   */
  function findWarnTemplate(violationIds) {
    return CONFIG.verwarnungen.find(tpl => (tpl.verstoesse || []).some(id => violationIds.includes(id)))
      || CONFIG.verwarnungen.find(tpl => tpl.standard)
      || null;
  }


  function copyVerwarntext() {
    const tpl = findWarnTemplate(getAEHelperValues("bewerten").violationIds);

    if (!tpl) {
      showToast("Kein passender Verwarntext. Lege in den Melde-Helfer-Einstellungen einen Standardtext fest.");
      return;
    }

    copyToClipboard(fillTemplate(tpl.text, getPlaceholderValues("bewerten")),
      `Verwarntext „${tpl.title}“ wurde in die Zwischenablage kopiert.`);
  }


  function buildAdminComment() {
    const text = isAEMeldung() ? CONFIG.festeTexte.adminAE : CONFIG.festeTexte.adminAllgemein;
    return fillTemplate(text, getPlaceholderValues("bewerten"));
  }


  /**
   * ============================================================
   * 13. Listener
   * ============================================================
   */
  function attachListeners() {
    const bewertungSelect = getBewertungSelect();
    if (!bewertungSelect) return;

    if (!bewertungSelect.dataset.meldeListenerAttached) {
      bewertungSelect.addEventListener("change", () => generateComment(false));
      bewertungSelect.dataset.meldeListenerAttached = "1";
    }

    getSanctionInputs().forEach(input => {
      if (input.dataset.meldeActionListenerAttached) return;

      input.addEventListener("change", () => {
        if (getBewertungKey() === "ber") generateComment(true);
        updateActionButtonsVisibility();
      });

      input.dataset.meldeActionListenerAttached = "1";
    });
  }


  /**
   * ============================================================
   * 14. Menüpunkt
   * ============================================================
   *
   * Unser Link steht fest direkt hinter "Einstellungen" (Extended
   * Admincall). Andere Skripte wie "Mentoring" hängen sich ans Ende an –
   * dadurch gibt es keinen Wettlauf um die Reihenfolge.
   *
   * Extended Admincall schreibt #navi beim Laden neu. injectNaviLink läuft
   * deshalb direkt im MutationObserver (ohne Verzögerung), sodass der Link
   * vor dem nächsten Zeichnen wieder da ist – kein Flackern.
   */


  const SETTINGS_URL = "ac_admintoplist.pl?meldehelfer=1";
  let naviMoves = 0;

  function isMeldeHelferSettingsPage() {
    return new URL(window.location.href).searchParams.get("meldehelfer") === "1";
  }


  function injectNaviLink() {
    const navi = document.getElementById("navi");
    if (!navi) return;

    let wrap = document.getElementById("mh-navi");
    if (!wrap) {
      wrap = h("span", { id: "mh-navi" }, " | ", h("a", { href: SETTINGS_URL }, "Melde-Helfer"));
    }

    // Ohne Extended Admincall gibt es keinen Einstellungen-Link → ans Ende
    const anchor = navi.querySelector('a[href*="settings=1"]');

    if (anchor) {
      // Begrenzt, falls ein anderes Skript genau denselben Platz beansprucht
      if (anchor.nextElementSibling !== wrap && naviMoves < 20) {
        naviMoves += 1;
        anchor.insertAdjacentElement("afterend", wrap);
      }
    } else if (!wrap.isConnected) {
      navi.appendChild(wrap);
    }

    if (isMeldeHelferSettingsPage()) {
      navi.querySelectorAll("a.activeNavi").forEach(a => {
        if (!wrap.contains(a)) a.classList.remove("activeNavi");
      });
      wrap.querySelector("a").classList.add("activeNavi");
    }
  }


  /**
   * ============================================================
   * 15. Einstellungsseite
   * ============================================================
   *
   * Aufbau wie die Einstellungen von Extended Admincall (gleiche
   * Klassen → gleiche Optik). Änderungen werden sofort gespeichert.
   */


  const SETTINGS_TABS = [
    { key: "verstoesse", label: "Verstöße", icon: "🚫", reset: ["verstoesse"], render: renderVerstoesseTab },
    { key: "sanktionen", label: "Sanktionen", icon: "⛔", reset: ["sanktionen"], render: renderSanktionenTab },
    { key: "ems", label: "EMS", icon: "📧", reset: ["ems"], render: renderEmsTab },
    { key: "teams", label: "Teamleiter", icon: "👥", reset: ["teams"], render: renderTeamsTab },
    { key: "kommentare", label: "Kommentar", icon: "📄", reset: ["kommentare", "festeTexte"], render: renderKommentarTab },
    { key: "verwarnungen", label: "Verwarnung", icon: "⚠️", reset: ["verwarnungen"], render: renderVerwarnungTab }
  ];

  const settingsWaitStart = Date.now();
  let statusEl = null;
  let statusTimer = null;
  let saveTimer = null;
  let pendingFocus = null;


  function persist() {
    clearTimeout(saveTimer);
    saveConfig();

    if (!statusEl) return;
    statusEl.classList.add("show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl && statusEl.classList.remove("show"), 1500);
  }


  /**
   * Für Texteingaben: gesammelt speichern.
   */
  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }


  function sessionGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function sessionSet(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) { /* egal */ }
  }


  /**
   * Rendert die Seite, sobald Extended Admincall fertig ist
   * (max. 2,5 s warten, danach auch ohne).
   */
  function maybeRenderSettings() {
    if (!isMeldeHelferSettingsPage() || document.getElementById("mh-settings")) return;

    const content = document.getElementById("content") || document.getElementById("main");
    if (!content) return;

    if (!isExtendedAdmincallActive() && Date.now() - settingsWaitStart < 2500) {
      setTimeout(scheduleInit, 400);
      return;
    }

    renderSettingsPage(content);
  }


  function renderSettingsPage(content) {
    document.title = "Melde-Helfer – Einstellungen";
    content.innerHTML = "";

    const active = sessionGet("mhSettingsTab") || SETTINGS_TABS[0].key;
    const ul = h("ul", { id: "tabs" });

    SETTINGS_TABS.forEach(tab => {
      const radioId = "mh-tab-" + tab.key;
      const section = h("section");

      const radio = h("input", {
        type: "radio",
        name: "mhTabControl",
        id: radioId,
        checked: tab.key === active,
        onchange: () => {
          sessionSet("mhSettingsTab", tab.key);
          renderTab(tab, section);
        }
      });

      ul.appendChild(h("li", {}, radio, h("label", { htmlFor: radioId }, tab.label), section));

      if (tab.key === active) renderTab(tab, section);
    });

    content.appendChild(
      h("div", { class: "settingsPage mh-settings", id: "mh-settings" },
        h("div", { class: "configContent" }, ul)
      )
    );
  }


  function renderTab(tab, section) {
    const rerender = () => renderTab(tab, section);
    const body = h("div");

    statusEl = h("span", { class: "mh-status" }, "✔ Gespeichert");

    section.innerHTML = "";
    section.appendChild(
      h("div", { class: "memberWrapper", style: { marginTop: "10px" } },
        h("h3", {}, `${tab.icon} Melde-Helfer – ${tab.label}`),
        h("div", { class: "mh-toolbar" },
          h("input", {
            type: "button",
            value: "🛠️ Standard wiederherstellen",
            title: "Setzt nur diesen Tab auf den Auslieferungszustand zurück.",
            onclick: () => {
              if (!confirm(`„${tab.label}“ auf den Standard zurücksetzen? Deine Änderungen in diesem Tab gehen verloren.`)) return;
              tab.reset.forEach(key => { CONFIG[key] = defaultSection(key, CONFIG); });
              persist();
              rerender();
            }
          }),
          statusEl
        ),
        body
      )
    );

    tab.render(body, rerender);

    if (pendingFocus) {
      const target = section.querySelector(`[data-focus-key="${CSS.escape(pendingFocus)}"]`);
      pendingFocus = null;
      if (target) {
        target.focus();
        if (target.select) target.select();
      }
    }
  }


  /* ---------- Gemeinsame Bausteine ---------- */


  function iconButton(symbol, title, onClick, disabled) {
    return h("button", { type: "button", class: "mh-iconbtn", title, disabled: !!disabled, onclick: onClick }, symbol);
  }


  function hint(text) {
    return h("div", { class: "mh-hint" }, text);
  }


  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;

    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }


  function placeholderChips(textarea, keys) {
    if (!keys.length) return null;

    return h("div", { class: "mh-chips" },
      h("span", { class: "mh-hint", style: { margin: "0 4px 0 0" } }, "Einfügen:"),
      keys.map(key => h("span", {
        class: "mh-chip",
        title: PLATZHALTER_INFO[key],
        onclick: () => insertAtCursor(textarea, `{{${key}}}`)
      }, `{{${key}}}`))
    );
  }


  function placeholderLegend(keys) {
    return h("div", {},
      h("div", { class: "mh-small-title" }, "Verfügbare Platzhalter"),
      h("table", { class: "mh-legend" },
        keys.map(key => h("tr", {},
          h("td", {}, h("code", {}, `{{${key}}}`)),
          h("td", {}, PLATZHALTER_INFO[key])
        ))
      ),
      hint("Text in eckigen Klammern wie [X] bleibt stehen und muss von Hand ersetzt werden – "
        + "Extended Admincall springt mit Alt+P dorthin und warnt beim Absenden.")
    );
  }


  function textEditor(value, onInput, focusKey, rows = 5) {
    return h("textarea", {
      rows,
      value,
      dataset: focusKey ? { focusKey } : undefined,
      oninput: e => { onInput(e.target.value); persistSoon(); }
    });
  }


  /**
   * Reihenfolge-Änderung in einer flachen Liste.
   */
  function moveInList(list, from, to) {
    if (to < 0 || to >= list.length || from === to) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
  }


  function setDropMark(row, pos) {
    row.classList.remove("mh-drop-before", "mh-drop-after", "mh-drop-inside");
    if (pos) row.classList.add("mh-drop-" + pos);
  }


  /* ---------- Flache Listen (Sanktionen, EMS, Teams) ---------- */


  let listDrag = null;

  /**
   * opts:
   * - name:         Kennung (für Fokus)
   * - fields:       (item, index) => [Elemente]
   * - create:       () => neues Element
   * - addLabel:     Text des Hinzufügen-Buttons
   */
  function renderListEditor(body, list, opts, rerender) {
    const wrap = h("div");

    list.forEach((item, index) => {
      const row = h("div", { class: "mh-row-edit", style: { paddingLeft: "4px" } });

      const handle = h("span", { class: "mh-handle", draggable: true, title: "Ziehen zum Verschieben" }, "⠿");
      handle.addEventListener("dragstart", e => {
        listDrag = { list, index };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        try { e.dataTransfer.setDragImage(row, 10, 10); } catch (err) { /* egal */ }
        setTimeout(() => row.classList.add("mh-dragging"), 0);
      });
      handle.addEventListener("dragend", () => {
        listDrag = null;
        row.classList.remove("mh-dragging");
      });

      row.addEventListener("dragover", e => {
        if (!listDrag || listDrag.list !== list || listDrag.index === index) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        setDropMark(row, e.clientY - rect.top < rect.height / 2 ? "before" : "after");
      });
      row.addEventListener("dragleave", () => setDropMark(row, null));
      row.addEventListener("drop", e => {
        if (!listDrag || listDrag.list !== list) return;
        e.preventDefault();

        const rect = row.getBoundingClientRect();
        const after = e.clientY - rect.top >= rect.height / 2;
        const from = listDrag.index;
        let to = index + (after ? 1 : 0);
        if (from < to) to -= 1;

        listDrag = null;
        moveInList(list, from, to);
        persist();
        rerender();
      });

      row.append(
        handle,
        ...opts.fields(item, index),
        iconButton("↑", "Nach oben", () => { moveInList(list, index, index - 1); persist(); rerender(); }, index === 0),
        iconButton("↓", "Nach unten", () => { moveInList(list, index, index + 1); persist(); rerender(); }, index === list.length - 1),
        iconButton("🗑", "Entfernen", () => { list.splice(index, 1); persist(); rerender(); })
      );

      wrap.appendChild(row);
    });

    body.append(
      wrap,
      h("div", { class: "mh-toolbar" },
        createButton("➕ " + opts.addLabel, () => {
          list.push(opts.create());
          pendingFocus = `${opts.name}:${list.length - 1}`;
          persist();
          rerender();
        })
      )
    );
  }


  function stringListEditor(body, list, name, addLabel, rerender) {
    renderListEditor(body, list, {
      name,
      addLabel,
      create: () => "",
      fields: (item, index) => [
        h("input", {
          type: "text",
          class: "mh-grow",
          value: item,
          dataset: { focusKey: `${name}:${index}` },
          oninput: e => { list[index] = e.target.value; persistSoon(); }
        })
      ]
    }, rerender);
  }


  function renderSanktionenTab(body, rerender) {
    body.append(hint("Auswahl „Empfohlene Sperre“ im Weiterleitungs-Helfer. Der Eintrag „Permanent“ nutzt den eigenen "
      + "Empfehlungstext (Tab Kommentar → Feste Texte), alle anderen werden als {{EMPFEHLUNG}} eingesetzt."));
    stringListEditor(body, CONFIG.sanktionen, "sanktion", "Sanktion hinzufügen", rerender);
  }


  function renderEmsTab(body, rerender) {
    body.append(hint("Auswahl „EMS-Kontrolle“ im AE-Helfer. Ohne Auswahl wird automatisch „keine“ bzw. „DURCHFÜHREN“ eingesetzt."));
    stringListEditor(body, CONFIG.ems, "ems", "Eintrag hinzufügen", rerender);
  }


  function renderTeamsTab(body, rerender) {
    body.append(hint("Teamleiter mit Komma trennen. Beim Anhaken eines Teams im Weiterleitungs-/Übergabe-Bereich "
      + "werden die Nicks ins Nickfeld übernommen."));

    renderListEditor(body, CONFIG.teams, {
      name: "team",
      addLabel: "Team hinzufügen",
      create: () => ({ id: uid(), name: "", leads: "" }),
      fields: (team, index) => [
        h("input", {
          type: "text",
          value: team.name,
          placeholder: "Team",
          style: { width: "170px" },
          dataset: { focusKey: `team:${index}` },
          oninput: e => { team.name = e.target.value; persistSoon(); }
        }),
        h("input", {
          type: "text",
          class: "mh-grow",
          value: team.leads,
          placeholder: "Nick1, Nick2, …",
          oninput: e => { team.leads = e.target.value; persistSoon(); }
        })
      ]
    }, rerender);
  }


  /* ---------- Verstöße (Baum) ---------- */


  const editorExpanded = new Set();
  let treeDragId = null;


  function newTreeNode(group) {
    return group
      ? { id: uid(), label: "Neue Gruppe", children: [] }
      : { id: uid(), label: "Neuer Verstoß" };
  }


  /**
   * Entfernt gelöschte Verstöße aus den Verwarnungs-Zuordnungen.
   */
  function forgetViolations(node) {
    const ids = isGroup(node) ? collectItems(node.children).map(n => n.id) : [node.id];
    CONFIG.verwarnungen.forEach(tpl => {
      tpl.verstoesse = (tpl.verstoesse || []).filter(id => !ids.includes(id));
    });
  }


  function moveTreeNode(dragId, targetId, pos) {
    const tree = CONFIG.verstoesse;
    const source = findNode(tree, dragId);
    if (!source) return;

    source.list.splice(source.index, 1);

    if (targetId === null) {
      tree.push(source.node);
      return;
    }

    const target = findNode(tree, targetId);

    if (pos === "inside") {
      target.node.children.push(source.node);
      editorExpanded.add(target.node.id);
    } else {
      target.list.splice(target.index + (pos === "after" ? 1 : 0), 0, source.node);
    }
  }


  function canDropOn(targetId) {
    if (!treeDragId || treeDragId === targetId) return false;
    const dragged = findNode(CONFIG.verstoesse, treeDragId);
    return !!dragged && !containsNode(dragged.node, targetId);
  }


  function renderVerstoesseTab(body, rerender) {
    body.append(
      hint("Verschieben per Ziehen (⠿) oder mit den Pfeilen. ← holt einen Eintrag aus seiner Gruppe heraus, "
        + "→ schiebt ihn in die Gruppe direkt darüber. Beim Ziehen auf eine Gruppe: oberer/unterer Rand = davor/danach, "
        + "Mitte = hinein."),
      h("div", { class: "mh-toolbar" },
        createButton("➕ Kategorie", () => {
          const node = newTreeNode(true);
          CONFIG.verstoesse.push(node);
          pendingFocus = node.id;
          persist();
          rerender();
        }),
        createButton("➕ Verstoß (oberste Ebene)", () => {
          const node = newTreeNode(false);
          CONFIG.verstoesse.push(node);
          pendingFocus = node.id;
          persist();
          rerender();
        }),
        createButton("Alle aufklappen", () => {
          (function walk(nodes) {
            nodes.forEach(n => { if (isGroup(n)) { editorExpanded.add(n.id); walk(n.children); } });
          })(CONFIG.verstoesse);
          rerender();
        }),
        createButton("Alle zuklappen", () => { editorExpanded.clear(); rerender(); })
      )
    );

    const tree = h("div");
    renderTreeRows(CONFIG.verstoesse, tree, 0, null, rerender);

    const endZone = h("div", { class: "mh-dropzone" }, "Hierher ziehen = ans Ende der obersten Ebene");
    endZone.addEventListener("dragover", e => {
      if (!treeDragId) return;
      e.preventDefault();
      endZone.classList.add("mh-drop-inside");
    });
    endZone.addEventListener("dragleave", () => endZone.classList.remove("mh-drop-inside"));
    endZone.addEventListener("drop", e => {
      if (!treeDragId) return;
      e.preventDefault();
      moveTreeNode(treeDragId, null);
      treeDragId = null;
      persist();
      rerender();
    });

    body.append(tree, endZone);
  }


  function renderTreeRows(nodes, container, depth, parentNode, rerender) {
    nodes.forEach((node, index) => {
      const group = isGroup(node);
      const open = editorExpanded.has(node.id);
      const prev = nodes[index - 1];

      const row = h("div", {
        class: "mh-row-edit" + (group ? " mh-row-group" : ""),
        style: { paddingLeft: (4 + depth * 26) + "px" }
      });

      // Ziehen
      const handle = h("span", { class: "mh-handle", draggable: true, title: "Ziehen zum Verschieben" }, "⠿");
      handle.addEventListener("dragstart", e => {
        treeDragId = node.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", node.id);
        try { e.dataTransfer.setDragImage(row, 10, 10); } catch (err) { /* egal */ }
        setTimeout(() => row.classList.add("mh-dragging"), 0);
      });
      handle.addEventListener("dragend", () => {
        treeDragId = null;
        row.classList.remove("mh-dragging");
      });

      const dropPos = e => {
        const rect = row.getBoundingClientRect();
        const y = (e.clientY - rect.top) / rect.height;
        if (!group) return y < 0.5 ? "before" : "after";
        return y < 0.3 ? "before" : y > 0.7 ? "after" : "inside";
      };

      row.addEventListener("dragover", e => {
        if (!canDropOn(node.id)) return;
        e.preventDefault();
        setDropMark(row, dropPos(e));
      });
      row.addEventListener("dragleave", () => setDropMark(row, null));
      row.addEventListener("drop", e => {
        if (!canDropOn(node.id)) return;
        e.preventDefault();
        moveTreeNode(treeDragId, node.id, dropPos(e));
        treeDragId = null;
        persist();
        rerender();
      });

      const toggle = group
        ? iconButton(open ? "▼" : "▶", open ? "Zuklappen" : "Aufklappen", () => {
          if (open) editorExpanded.delete(node.id);
          else editorExpanded.add(node.id);
          rerender();
        })
        : h("span", { class: "mh-spacer" });

      const badgeText = group
        ? `${depth === 0 ? "Kategorie" : "Untergruppe"} · ${collectItems(node.children).length}`
        : "Verstoß";

      row.append(
        handle,
        toggle,
        h("input", {
          type: "text",
          class: "mh-grow",
          value: node.label,
          dataset: { focusKey: node.id },
          oninput: e => { node.label = e.target.value; persistSoon(); }
        }),
        h("span", { class: "mh-badge" }, badgeText),
        iconButton("↑", "Nach oben", () => { moveInList(nodes, index, index - 1); persist(); rerender(); }, index === 0),
        iconButton("↓", "Nach unten", () => { moveInList(nodes, index, index + 1); persist(); rerender(); }, index === nodes.length - 1),
        iconButton("←", "Aus der Gruppe herausnehmen", () => {
          const parentInfo = findNode(CONFIG.verstoesse, parentNode.id);
          nodes.splice(index, 1);
          parentInfo.list.splice(parentInfo.index + 1, 0, node);
          persist();
          rerender();
        }, !parentNode),
        iconButton("→", "In die Gruppe darüber verschieben", () => {
          nodes.splice(index, 1);
          prev.children.push(node);
          editorExpanded.add(prev.id);
          persist();
          rerender();
        }, !prev || !isGroup(prev)),
        group ? iconButton("➕", "Verstoß in dieser Gruppe anlegen", () => {
          const child = newTreeNode(false);
          node.children.push(child);
          editorExpanded.add(node.id);
          pendingFocus = child.id;
          persist();
          rerender();
        }) : h("span", { class: "mh-spacer" }),
        group ? iconButton("📁", "Untergruppe anlegen", () => {
          const child = newTreeNode(true);
          node.children.push(child);
          editorExpanded.add(node.id);
          pendingFocus = child.id;
          persist();
          rerender();
        }) : h("span", { class: "mh-spacer" }),
        iconButton("🗑", "Entfernen", () => {
          const count = group ? collectItems(node.children).length : 0;
          if (group && (count || node.children.length)
            && !confirm(`Gruppe „${node.label}“ mit ${count} Verstößen löschen?`)) return;

          nodes.splice(index, 1);
          forgetViolations(node);
          persist();
          rerender();
        })
      );

      container.appendChild(row);

      if (group && open) {
        renderTreeRows(node.children, container, depth + 1, node, rerender);
      }
    });
  }


  /* ---------- Aufklappbare Text-Karten ---------- */


  const cardExpanded = new Set();


  /**
   * Karte, die zugeklappt nur die Überschrift zeigt.
   *
   * opts:
   * - key:     eindeutiger Schlüssel (Auf-/Zuklappen, Fokus)
   * - title:   Überschrift
   * - summary: kurzer Zusatz in der zugeklappten Zeile
   * - onTitle: (wert) => void – Überschrift bearbeitbar (aufgeklappt)
   * - list/index/removeText: Verschieben und Entfernen (optional)
   * - body:    () => [Elemente] – Inhalt im aufgeklappten Zustand
   */
  function textCard(opts, rerender) {
    const open = cardExpanded.has(opts.key);

    const toggle = () => {
      if (open) cardExpanded.delete(opts.key);
      else cardExpanded.add(opts.key);
      rerender();
    };

    const title = open && opts.onTitle
      ? h("input", {
        type: "text",
        class: "mh-grow",
        value: opts.title,
        placeholder: "Bezeichnung",
        dataset: { focusKey: opts.key },
        oninput: e => {
          opts.onTitle(e.target.value);
          // Namen in den Zuordnungs-Dropdowns gleich mitziehen
          document.querySelectorAll(`option[data-tpl="${CSS.escape(opts.key)}"]`).forEach(o => {
            o.textContent = e.target.value || "(ohne Namen)";
          });
          persistSoon();
        }
      })
      : h("span", { class: "mh-grow mh-card-title", onclick: toggle },
        opts.title || "(ohne Namen)",
        opts.summary ? h("span", { class: "mh-owner" }, "  ·  " + opts.summary) : null
      );

    const { list, index } = opts;

    const head = h("div", { class: "mh-card-head" },
      iconButton(open ? "▼" : "▶", open ? "Zuklappen" : "Aufklappen", toggle),
      title,
      list ? [
        iconButton("↑", "Nach oben", () => { moveInList(list, index, index - 1); persist(); rerender(); }, index === 0),
        iconButton("↓", "Nach unten", () => { moveInList(list, index, index + 1); persist(); rerender(); }, index === list.length - 1),
        iconButton("🗑", "Entfernen", () => {
          if (!confirm(opts.removeText.replace("%s", opts.title || "ohne Namen"))) return;
          list.splice(index, 1);
          persist();
          rerender();
        })
      ] : null
    );

    return h("div", { class: "mh-card" + (open ? " open" : "") },
      head,
      open ? h("div", { class: "mh-card-body" }, opts.body()) : null
    );
  }


  function addAndOpen(list, item, rerender) {
    list.push(item);
    cardExpanded.add(item.id);
    pendingFocus = item.id;
    persist();
    rerender();
  }


  /* ---------- Kommentar ---------- */


  function bewertungLabel(bew) {
    return bew === "ber" ? "berechtigt" : "unberechtigt";
  }


  /**
   * Eine Tabelle: pro Meldetyp und Bewertung ein Dropdown mit der Vorlage.
   */
  function assignmentTable(rerender) {
    const select = key => {
      const current = CONFIG.kommentare.find(tpl => tpl.zuordnung.includes(key));

      const sel = h("select", {
        onchange: e => {
          CONFIG.kommentare.forEach(tpl => { tpl.zuordnung = tpl.zuordnung.filter(k => k !== key); });
          const chosen = CONFIG.kommentare.find(tpl => tpl.id === e.target.value);
          if (chosen) chosen.zuordnung.push(key);
          persist();
          rerender();
        }
      },
        h("option", { value: "" }, "— keine —"),
        CONFIG.kommentare.map(tpl => h("option", { value: tpl.id, dataset: { tpl: tpl.id } }, tpl.title || "(ohne Namen)"))
      );

      sel.value = current ? current.id : "";
      return sel;
    };

    return h("table", { class: "mh-matrix" },
      h("tr", {}, h("th", {}, "Meldetyp"), h("th", {}, "Berechtigt"), h("th", {}, "Unberechtigt")),
      MELDETYPEN.map(typ => h("tr", {},
        h("td", {}, typ.label),
        h("td", {}, select(`${typ.key}|ber`)),
        h("td", {}, select(`${typ.key}|unber`))
      ))
    );
  }


  function renderKommentarTab(body, rerender) {
    body.append(
      h("div", { class: "mh-subtitle", style: { marginTop: "0" } }, "Zuordnung"),
      hint("Welche Vorlage bei welchem Meldetyp und welcher Bewertung verwendet wird. Der Button „Kommentar "
        + "generieren“ im Helfer fügt immer die passende Vorlage ein (ohne Bewertung und bei Weiterleitung: "
        + "berechtigt). Vorlagen mit „Automatisch einfügen“ kommen zusätzlich schon beim Auswählen der Bewertung."),
      assignmentTable(rerender),

      h("div", { class: "mh-subtitle" }, "Vorlagen"),
      placeholderLegend(KOMMENTAR_PLATZHALTER)
    );

    CONFIG.kommentare.forEach((tpl, index) => body.appendChild(commentCard(tpl, index, rerender)));

    body.append(
      h("div", { class: "mh-toolbar" },
        createButton("➕ Vorlage hinzufügen", () => {
          addAndOpen(CONFIG.kommentare, { id: uid(), title: "Neue Vorlage", text: "", zuordnung: [], auto: true }, rerender);
        })
      ),
      h("div", { class: "mh-subtitle" }, "Feste Texte")
    );

    FESTE_TEXTE_META.forEach(meta => {
      body.appendChild(textCard({
        key: "fest:" + meta.key,
        title: meta.title,
        body: () => {
          const textarea = textEditor(CONFIG.festeTexte[meta.key], v => { CONFIG.festeTexte[meta.key] = v; }, null, 2);
          return [hint(meta.hint), textarea, placeholderChips(textarea, meta.placeholders)];
        }
      }, rerender));
    });
  }


  function commentCard(tpl, index, rerender) {
    const verwendung = tpl.zuordnung
      .map(key => {
        const [typKey, bew] = key.split("|");
        const typ = MELDETYPEN.find(t => t.key === typKey);
        return typ ? `${typ.label.replace(/ melden$/, "")} (${bewertungLabel(bew)})` : null;
      })
      .filter(Boolean);

    const summary = [
      verwendung.length ? verwendung.join(", ") : "nicht zugeordnet",
      tpl.auto === false ? "nur über Button" : null
    ].filter(Boolean).join("  ·  ");

    return textCard({
      key: tpl.id,
      title: tpl.title,
      summary,
      onTitle: v => { tpl.title = v; },
      list: CONFIG.kommentare,
      index,
      removeText: "Vorlage „%s“ entfernen?",
      body: () => {
        const lines = (tpl.text || "").split("\n").length;
        const textarea = textEditor(tpl.text, v => { tpl.text = v; }, null, Math.min(16, Math.max(4, lines + 1)));

        return [
          textarea,
          placeholderChips(textarea, KOMMENTAR_PLATZHALTER),
          h("label", { style: { display: "block", margin: "6px 0", cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: tpl.auto !== false,
              onchange: e => { tpl.auto = e.target.checked; persist(); }
            }),
            " Automatisch einfügen, sobald die Bewertung gewählt wird (sonst nur über „Kommentar generieren“)"
          ),
          hint("Verwendet für: " + (verwendung.length ? verwendung.join(", ") : "– (oben in der Zuordnung auswählen)"))
        ];
      }
    }, rerender);
  }


  /* ---------- Verwarnung ---------- */


  const warnExpanded = new Set();


  function renderVerwarnungTab(body, rerender) {
    body.append(
      placeholderLegend(VERWARN_PLATZHALTER),
      h("div", { class: "mh-subtitle" }, "Verwarntexte"),
      hint("„Verwarntext kopieren“ im Helfer nimmt die oberste Vorlage, die einen der angehakten Verstöße enthält "
        + "(Reihenfolge = Priorität). Passt keine, wird der Standardtext verwendet. Jeder Verstoß kann nur einer "
        + "Vorlage zugeordnet werden – vergebene sind ausgegraut. Optional bekommt eine Vorlage einen eigenen "
        + "Kopier-Button, der nur bei bestimmten Meldetypen erscheint.")
    );

    CONFIG.verwarnungen.forEach((tpl, index) => body.appendChild(warnCard(tpl, index, rerender)));

    body.appendChild(h("div", { class: "mh-toolbar" },
      createButton("➕ Verwarntext hinzufügen", () => {
        addAndOpen(CONFIG.verwarnungen, {
          id: uid(), title: "Neuer Verwarntext", text: "Hallo {{NICK}},\n\n", verstoesse: [], standard: false, buttonMeldetypen: []
        }, rerender);
      })
    ));
  }


  function warnOwner(id, tpl) {
    return CONFIG.verwarnungen.find(other => other !== tpl && (other.verstoesse || []).includes(id));
  }


  function warnCard(tpl, index, rerender) {
    tpl.verstoesse = tpl.verstoesse || [];
    tpl.buttonMeldetypen = tpl.buttonMeldetypen || [];

    const existingIds = collectItems(CONFIG.verstoesse).map(n => n.id);
    const selectedCount = tpl.verstoesse.filter(id => existingIds.includes(id)).length;

    const summary = [
      `${selectedCount} ${selectedCount === 1 ? "Verstoß" : "Verstöße"}`,
      tpl.standard ? "Standardtext" : null,
      tpl.buttonMeldetypen.length ? "eigener Button" : null
    ].filter(Boolean).join("  ·  ");

    return textCard({
      key: tpl.id,
      title: tpl.title,
      summary,
      onTitle: v => { tpl.title = v; },
      list: CONFIG.verwarnungen,
      index,
      removeText: "Verwarntext „%s“ entfernen?",
      body: () => warnCardBody(tpl, selectedCount, rerender)
    }, rerender);
  }


  function warnCardBody(tpl, selectedCount, rerender) {
    const textarea = textEditor(tpl.text, v => { tpl.text = v; }, null, 8);

    const tree = h("div", { class: "mh-vtree" });
    renderWarnTree(CONFIG.verstoesse, tree, tpl, 0, rerender);

    return [
      textarea,
      placeholderChips(textarea, VERWARN_PLATZHALTER),
      h("label", { style: { display: "block", margin: "6px 0", cursor: "pointer" } },
        h("input", {
          type: "checkbox",
          checked: !!tpl.standard,
          onchange: e => {
            CONFIG.verwarnungen.forEach(other => { other.standard = false; });
            tpl.standard = e.target.checked;
            persist();
            rerender();
          }
        }),
        " Standardtext – wenn kein anderer Verwarntext zu den angehakten Verstößen passt"
      ),
      h("div", { class: "mh-small-title" }, `Verwenden für Verstöße (${selectedCount} ausgewählt):`),
      tree,
      h("div", { class: "mh-small-title" }, "Eigener Kopier-Button im Helfer bei Meldetypen:"),
      h("div", { class: "mh-inline-checks" },
        MELDETYPEN.map(typ => h("label", {},
          h("input", {
            type: "checkbox",
            checked: tpl.buttonMeldetypen.includes(typ.key),
            onchange: e => {
              tpl.buttonMeldetypen = tpl.buttonMeldetypen.filter(k => k !== typ.key);
              if (e.target.checked) tpl.buttonMeldetypen.push(typ.key);
              persist();
              rerender();
            }
          }),
          " " + typ.label
        ))
      )
    ];
  }


  function renderWarnTree(nodes, container, tpl, depth, rerender) {
    nodes.forEach(node => {
      const indent = { paddingLeft: (depth * 18) + "px" };

      if (!isGroup(node)) {
        const owner = warnOwner(node.id, tpl);

        container.appendChild(h("label", { class: owner ? "mh-disabled" : "", style: indent },
          h("input", {
            type: "checkbox",
            checked: tpl.verstoesse.includes(node.id),
            disabled: !!owner,
            title: owner ? `Belegt durch „${owner.title}“` : "",
            onchange: e => {
              tpl.verstoesse = tpl.verstoesse.filter(id => id !== node.id);
              if (e.target.checked) tpl.verstoesse.push(node.id);
              persist();
              rerender();
            }
          }),
          " " + node.label,
          owner ? h("span", { class: "mh-owner" }, " → " + owner.title) : null
        ));
        return;
      }

      const key = tpl.id + ":" + node.id;
      const open = warnExpanded.has(key);
      const items = collectItems(node.children);
      const free = items.filter(item => !warnOwner(item.id, tpl));
      const chosen = items.filter(item => tpl.verstoesse.includes(item.id)).length;
      const allChosen = free.length > 0 && free.every(item => tpl.verstoesse.includes(item.id));

      const groupBox = h("input", {
        type: "checkbox",
        checked: allChosen,
        disabled: free.length === 0,
        title: "Alle freien Verstöße dieser Gruppe",
        onchange: e => {
          const ids = items.map(item => item.id);
          tpl.verstoesse = tpl.verstoesse.filter(id => !ids.includes(id));
          if (e.target.checked) tpl.verstoesse.push(...free.map(item => item.id));
          persist();
          rerender();
        }
      });
      groupBox.indeterminate = chosen > 0 && !allChosen;

      container.appendChild(h("div", { style: indent },
        groupBox,
        h("span", {
          class: "mh-vgroup",
          onclick: () => {
            if (open) warnExpanded.delete(key);
            else warnExpanded.add(key);
            rerender();
          }
        }, ` ${open ? "▼" : "▶"} ${node.label} (${chosen}/${items.length})`)
      ));

      if (open) renderWarnTree(node.children, container, tpl, depth + 1, rerender);
    });
  }


  /**
   * ============================================================
   * 16. Initialisierung
   * ============================================================
   */


  /**
   * Baut alles auf. Mehrfach aufrufbar (idempotent).
   */
  function initAddon() {
    ensureStyles();
    updateTheme();
    injectNaviLink();
    maybeRenderSettings();

    const bewertenTextarea = getBewertenCommentField();
    if (!bewertenTextarea) return;

    // Nicht im Meldungs-Overlay der Übersicht (Extended Admincall)
    if (bewertenTextarea.closest(".modal")) return;

    ensureGemeldetenInfoExpanded();
    resizeAECommentFields();
    injectUnifiedAEHelper("bewerten", bewertenTextarea);
    injectUnifiedAEHelper("forward", getForwardCommentField());
    injectTeamSelections();
    attachListeners();
    updateActionButtonsVisibility();
  }


  /**
   * DOM-Änderungen beobachten (dynamische Inhalte, Extended Admincall).
   * Entprellt; beobachtet auch <head>, um das Überschreiben unseres
   * Stylesheets zu bemerken.
   */
  let initTimer = null;

  function scheduleInit() {
    clearTimeout(initTimer);
    initTimer = setTimeout(initAddon, 300);
  }

  new MutationObserver(() => {
    // Menülink sofort (vor dem Zeichnen), alles andere entprellt
    injectNaviLink();
    scheduleInit();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });


  initAddon();
})();
