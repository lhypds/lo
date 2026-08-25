#!/bin/bash
# Does X actually answer for the token in .env?
#
# The trends card is the one part of lo that talks to a paid, credentialed
# upstream, so when it says "could not reach X" the cause is somewhere in a
# chain the app cannot see into: token, credits, account standing, network.
# This walks that chain from the outside and names the link that broke.
#
#   ./x_test.sh              # ask X about Tokyo
#   ./x_test.sh 44418        # ...or any other WOEID
#
# Each run costs one X request — $0.010 at the pay-per-use rate.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Tokyo: the id lo's own table resolves a Japanese fix to, so a green run here
# is the same call the trends card makes.
WOEID="${1:-1118370}"

if [ "$WOEID" = "-h" ] || [ "$WOEID" = "--help" ]; then
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

case "$WOEID" in
  ''|*[!0-9]*)
    echo "WOEID must be a number (got '$WOEID'). Tokyo is 1118370, Worldwide is 1." >&2
    exit 2
    ;;
esac

# The same precedence the server uses: a real environment variable wins, .env
# fills in. Everything after the first '=' is the value — bearer tokens carry
# their own '=' padding, so this cannot be a cut on the first field.
if [ -z "$X_BEARER_TOKEN" ] && [ -f "$ROOT/.env" ]; then
  X_BEARER_TOKEN=$(sed -n 's/^X_BEARER_TOKEN=//p' "$ROOT/.env" | head -1 |
    sed 's/^["'\'']//; s/["'\'']$//; s/[[:space:]]*$//')
fi

if [ -z "$X_BEARER_TOKEN" ]; then
  echo "X_BEARER_TOKEN is not set — nothing to test."
  echo
  echo "  Get one at https://console.x.com (New App -> Bearer Token, shown once),"
  echo "  buy credits, then put it in $ROOT/.env:"
  echo
  echo "      X_BEARER_TOKEN=AAAAAAAAAAAA..."
  echo
  echo "  Until then the trends card says so and the rest of lo runs as normal."
  exit 1
fi

# Enough of the token to tell two of them apart in a screenshot, and no more.
echo "Token  : ${X_BEARER_TOKEN:0:8}... (${#X_BEARER_TOKEN} chars)"
echo "Asking : https://api.x.com/2/trends/by/woeid/$WOEID"
echo "Cost   : \$0.010 for this one request"
echo

BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT

CODE=$(curl -sS -m 15 -o "$BODY" -w '%{http_code}' \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  -H "Accept: application/json" \
  "https://api.x.com/2/trends/by/woeid/${WOEID}?max_trends=10&trend.fields=trend_name,tweet_count" \
  2>"$BODY.err") || CODE=""

# No HTTP status at all means the request never landed — DNS, TLS, proxy, or a
# network that does not let this machine reach api.x.com.
if [ -z "$CODE" ]; then
  echo "FAIL: could not reach api.x.com at all."
  [ -s "$BODY.err" ] && sed 's/^/  curl: /' "$BODY.err"
  rm -f "$BODY.err"
  exit 1
fi
rm -f "$BODY.err"

# X explains itself in the body — its own `detail` is more specific than
# anything this script could infer from the status code alone.
detail() {
  node -e '
    try {
      const problem = JSON.parse(process.argv[1] || "{}");
      const text = problem.detail || problem.title || problem.errors?.[0]?.message;
      if (text) console.log("  X says: " + text);
    } catch {}
  ' "$(cat "$BODY")" 2>/dev/null || true
}

case "$CODE" in
  200) ;;
  401)
    echo "FAIL ($CODE): X rejected the token."
    detail
    echo "  The token is wrong, revoked, or was regenerated after this copy was saved."
    echo "  Regenerate it at https://console.x.com and update .env."
    exit 1
    ;;
  402)
    echo "FAIL ($CODE): payment required — the credit balance is empty."
    detail
    echo "  Top up in the Developer Console; trends is \$0.010 per request."
    exit 1
    ;;
  403)
    echo "FAIL ($CODE): the token is valid but not allowed to read trends."
    detail
    echo "  Usually an app without the right access level, or an account in a bad state."
    exit 1
    ;;
  429)
    echo "FAIL ($CODE): rate limited."
    detail
    echo "  The trends endpoint allows 75 requests / 15 min per app. lo caches for"
    echo "  30 minutes per WOEID, so this is far more likely to be something else"
    echo "  sharing the token than lo itself."
    exit 1
    ;;
  5*)
    echo "FAIL ($CODE): X is having a problem on its side. Worth retrying later."
    detail
    exit 1
    ;;
  *)
    echo "FAIL ($CODE): unexpected response."
    detail
    head -c 400 "$BODY"
    echo
    exit 1
    ;;
esac

# A 200 is not yet an answer: an unsupported WOEID is documented to come back
# empty rather than as an error, which looks identical to a working token
# pointed at a place X has no trends for.
node -e '
  const body = JSON.parse(process.argv[1] || "{}");
  const woeid = process.argv[2];
  const trends = Array.isArray(body.data) ? body.data : [];

  if (trends.length === 0) {
    console.log("OK (200): the token works — but X returned no trends for WOEID " + woeid + ".");
    console.log("  X answers an unsupported location with an empty list rather than an error,");
    console.log("  so this is most likely a WOEID it does not carry.");
    // No point sending someone to Worldwide when Worldwide is what just came
    // back empty — that would mean X itself has nothing, not a bad location.
    if (woeid !== "1") console.log("  Try `./x_test.sh 1` (Worldwide) to confirm the token itself is fine.");
    process.exit(3);
  }

  // A trend list for a Japanese fix is mostly kana and kanji, which occupy two
  // terminal columns each while counting as one character — so the column has
  // to be padded by display width or the numbers come out ragged.
  const width = (text) =>
    [...text].reduce((total, char) => total + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(char) ? 2 : 1), 0);
  const pad = (text, columns) => text + " ".repeat(Math.max(1, columns - width(text)));

  const count = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  console.log("OK (200): X answered with " + trends.length + " trends.\n");
  trends.forEach((trend, index) => {
    const rank = String(index + 1).padStart(2);
    const volume = Number.isFinite(trend.tweet_count) ? count.format(trend.tweet_count) : "—";
    console.log("  " + rank + ". " + pad(String(trend.trend_name ?? "?"), 30) + volume);
  });
  // tweet_count is optional in the schema and often missing; the card is built
  // for that, so it is worth seeing here rather than being surprised later.
  const missing = trends.filter((trend) => !Number.isFinite(trend.tweet_count)).length;
  if (missing > 0) console.log("\n  (" + missing + " of them came back without a tweet_count — normal.)");
' "$(cat "$BODY")" "$WOEID"

echo
echo "X is reachable. If the trends card still fails, the problem is between lo"
echo "and its own copy of the token — .env is only read at boot, so restart:"
echo "  pnpm dev            # or"
echo "  pm2 restart lo --update-env"
