#!/bin/zsh
# What the app needs, asked one host at a time, from wherever you are.
#
# For running on a network that is giving trouble — eduroam, a hospital
# wifi, a hotel. The browser version at /netcheck.html cannot help if the
# app's own domain is the thing being blocked, because it will not load;
# this does not need anything to load.
#
# Any HTTP reply means the host answered, including 401 and 403 — the
# question is reachability, not permission. Supabase answers 401 without a
# key and that is a pass. A connection that times out or refuses is the
# failure, and a filter swallowing requests is what a timeout looks like.
#
#   ./scripts/netcheck.sh

print -r -- ""
print -r -- "Network check · $(date '+%H:%M %d %b')"
print -r -- "────────────────────────────────────────────────────────────"

wifi=$(networksetup -getairportnetwork en0 2>/dev/null | sed 's/^Current Wi-Fi Network: //')
[[ -n "$wifi" && "$wifi" != *"not associated"* ]] && print -r -- "Wi-Fi:  $wifi" || print -r -- "Wi-Fi:  (not on wifi — ethernet or tethered)"
print -r -- ""

typeset -A WHY
WHY=(
  "app.tryresurface.com"              "the app itself — nothing loads without it"
  "api.tryresurface.com"              "generating questions, and the AI tutor"
  "uhqpljteohitvytwfadp.supabase.co"  "sign-in and all your data"
  "accounts.google.com"               "signing in with Google"
  "fonts.googleapis.com"              "the typeface (cosmetic)"
)
URLS=(
  "https://app.tryresurface.com"
  "https://api.tryresurface.com/api/keepalive"
  "https://uhqpljteohitvytwfadp.supabase.co/auth/v1/health"
  "https://accounts.google.com/generate_204"
  "https://fonts.googleapis.com/css2?family=Poppins:wght@600"
)

fails=0
for url in $URLS; do
  host=${${url#https://}%%/*}
  ip=$(dig +short +time=2 +tries=1 "$host" | tail -1)
  out=$(curl -sS -o /dev/null -m 10 -w '%{http_code} %{time_total}' "$url" 2>&1)
  code=${out%% *}

  if [[ "$code" == <-> && "$code" != "000" ]]; then
    verdict="reachable (HTTP $code)"
    mark="ok "
  else
    verdict="UNREACHABLE — ${out:-no response}"
    mark="!! "
    (( fails++ ))
  fi

  printf "%s%-34s %s\n" "$mark" "$host" "$verdict"
  printf "   %-34s dns: %s\n" "" "${ip:-DID NOT RESOLVE}"
  [[ "$mark" == "!! " ]] && printf "   %-34s breaks: %s\n" "" "$WHY[$host]"
done

print -r -- ""
print -r -- "TLS: is anything sitting in the middle?"
issuer=$(curl -sSv --max-time 10 https://app.tryresurface.com 2>&1 | grep -m1 "issuer:")
print -r -- "  ${issuer:-  (could not read the certificate — itself a sign)}"
print -r -- "  A real CA here (Let's Encrypt, Google Trust, DigiCert) is fine."
print -r -- "  The university's name, or a filter vendor's, means traffic is being opened."
print -r -- ""

if (( fails == 0 )); then
  print -r -- "Everything the app needs is reachable from this network."
else
  print -r -- "$fails host(s) unreachable. Screenshot this."
  print -r -- "If a browser shows a block page for any of them, screenshot that too —"
  print -r -- "it names the filter vendor and the category, which is the whole diagnosis."
fi
print -r -- ""
