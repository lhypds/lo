// What a reader hands to an AI, along with whatever their old app gave them, to
// get back a file lo can read.
//
// lo reads exactly one shape — the marks.json its own export writes — and every
// other app writes its own: Google Takeout hands out a folder of CSV and JSON,
// a map app hands out GPX or KML, a spreadsheet hands out whatever its owner
// typed. Teaching the server each of those is a parser per format and a new one
// every time somebody arrives from somewhere else. Teaching nobody anything and
// letting the reader's own AI do the reading costs one document, and it covers
// the formats nobody here has heard of as well as the three that were.
//
// So this is not code lo runs. It is the instructions for the conversion, written
// out precisely enough that what comes back is the shape server/users.js reads:
// the ids and the coordinates it insists on, the nulls it accepts, and the 48
// characters it cuts a label at.
//
// Written in English, whatever the sheet around it is read in. It is one document
// rather than six because it is addressed to a model rather than to the reader
// — the model takes the instruction in English and answers in JSON, and what the
// reader says to it around this is their own business and their own language.
export const MARKS_PROMPT = `# Convert a location export into lo's marks.json

You are given one or more files exported from another app: a Google Takeout
folder (Saved Places.json, a "Saved places" CSV, a My Maps KML, Records.json, or
a Timeline .json), a GPX or KML/KMZ from a map app, or any spreadsheet with
coordinates in it. Turn every saved place in them into a single file that lo can
read back in.

Answer with the file and nothing else: no explanation, no code fence, no
trailing note.

## The file

{
  "marks": [
    {
      "id": 1,
      "time": "2024-05-06T09:12:00.000Z",
      "latitude": 35.6812,
      "longitude": 139.7671,
      "accuracy": null,
      "label": {
        "en": "Tokyo Station",
        "ja": "東京駅"
      }
    }
  ]
}

## The fields

- id — a whole number, 1 and up, counting through the list. Every mark needs
  one and no two may share one.
- time — when the place was kept, as an ISO 8601 instant in UTC ending in Z. A
  date with no time becomes midnight UTC of that day. Nothing at all becomes
  "1970-01-01T00:00:00.000Z".
- latitude, longitude — decimal degrees, north and east positive. Convert
  anything written another way before you write it: degrees and minutes, an E7
  integer (divide by 10000000), a geo: URI, or a Google Maps URL with
  !3dLAT!4dLNG or ?q=LAT,LNG in it.
- accuracy — how good the fix was, in metres, as a number; null when the export
  does not say. Never guess one.
- label — what the place is called, keyed by language code: "en", "zh", "ja",
  "fr", "es" or "de". Only the languages the export actually names the place
  in, and {} for a place it names in none — but as many of the six as it does
  name it in, which is often more than one. Write each name under the language
  it is written in, and prefer the name the person gave the place over one the
  export generated. lo shows the reader whichever of the six they are reading
  in, and where there is no name in that one falls back to "en", "zh", "ja",
  "fr", "es" and then "de" — so a place named in one language only is still
  read by that name in the other five. 48 characters at most in each, which is
  where lo cuts it.

## Rules

- One mark per saved place. Do not invent places and do not merge two that are
  close together.
- A row with no usable coordinates is left out rather than guessed at.
- A missing field is written as null and its key kept — label is the exception,
  where a language with no name is left out of the object rather than written in
  empty.
- Take every language the export gives you. A place is often named twice in
  one file and in more than one way: a local name and an English one in the
  next column, a "name" tag beside a "name:en" or "name:fr" one, a KML <name>
  in one language and a <description> in another, a note the person typed in
  their own. That is one mark carrying two names, not two marks and not a
  choice between them — lo reads a list in six languages, and a name it is
  handed today is one it can show a reader who arrives in that language later.
- Do not invent a name that is not in the export, in any language, and do not
  transliterate one blind into a language the export did not write it in.
  Filling the six is worth doing where the export supports it and not worth
  guessing at: a language has a name of its own for a well-known place —
  Tokyo Station, 東京駅, Gare de Tokyo — and that one can be written down where
  you are certain of it, but a name you would be sounding out character by
  character is a guess, and lo would sooner show coordinates than a guess.
- A name is what the place is called, not where it sits. Do not put a district,
  city or country in label because the export knew one — an address names
  several thousand doorways and none of them well. A spot the export gives no
  name for has "label": {}; lo shows its coordinates, which is the truth about
  it.
- Do not round coordinates any further than the export already has.
- Latitude is between -90 and 90, longitude between -180 and 180. A row that
  fails that has its pair the wrong way round or is not a place at all: fix it
  or leave it out.
- Sort newest first where there are times; otherwise keep the order the export
  was in.

## One warning

A Timeline export holds every point a phone recorded, which can be hundreds of
thousands of rows, and lo is for places somebody chose to keep. Unless you are
told otherwise, take the visits and the saved places out of a Timeline and leave
the raw track behind.

Save your answer as marks.json.
`;

// Down as a file rather than onto the clipboard, because of where it is going:
// the reader is about to open something else — a chat, an editor — and drop this
// and their export into it together, and a clipboard holding one of the two is
// the wrong hand to arrive with. A file also survives the trip; a clipboard is
// gone the next time anything is copied.
//
// Built here in the browser rather than fetched: the document is a constant, and
// an endpoint for it would be a round trip to be told what this file already
// says. The blob is freed on the next turn rather than straight away — revoking
// it in the same tick can beat the browser to the download it has just been
// handed (see api.downloadExport, which does the same at the end of a real one).
export function downloadMarksPrompt() {
  const url = URL.createObjectURL(new Blob([MARKS_PROMPT], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "lo-marks-prompt.md";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
