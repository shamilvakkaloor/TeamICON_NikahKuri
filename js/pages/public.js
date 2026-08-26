/**
 * The public view. No login.
 *
 * It reads `publicRounds` — a projection maintained separately from the real
 * collections, containing only round number, groom name and photo, dates and
 * team totals. Nothing else in the database is world-readable, so a rules
 * mistake here cannot leak individual payment records or mobile numbers: the
 * path simply does not contain them.
 */

import { el, Badge, Card, EmptyState, Money, Skeleton } from "../lib/ui.js";
import { fmtDate } from "../lib/format.js";
import { col, ms } from "../lib/collections.js";
import { getDocs, orderBy, query } from "../lib/fs.js";

export function renderPublic(app) {
  const listHost = el("div", Skeleton(3));

  app.replaceChildren(
    el(
      "div.public-page",
      el(
        "header.row.between",
        { style: { marginBottom: "var(--s5)" } },
        el(
          "div.row",
          el("span.brand-mark", "N"),
          el("div", el("div.brand-name", "Nikah Kuri"), el("div.brand-sub", "Team ICON")),
        ),
        el("a.btn.outline.sm", { href: "#/" }, "Sign in"),
      ),
      listHost,
    ),
  );

  // Firestore retries a dropped connection quietly and indefinitely, so on a
  // very slow link this promise simply never settles. Without a deadline the
  // page would sit on a skeleton forever — a realistic outcome on patchy
  // mobile data, and a confusing one for a public visitor.
  const stallTimer = setTimeout(() => {
    listHost.replaceChildren(
      EmptyState({
        title: "Can’t reach the server",
        body: "Check your connection and reload. Round summaries will show once you’re back online.",
      }),
    );
  }, 10_000);

  getDocs(query(col("publicRounds"), orderBy("kuriNumber", "desc")))
    .then((snap) => {
      clearTimeout(stallTimer);
      const rounds = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          kuriNumber: data.kuriNumber ?? 0,
          groomName: data.groomName || "",
          groomPhotoUrl: data.groomPhotoUrl || "",
          nikahDate: ms(data.nikahDate),
          kuriLastDate: ms(data.kuriLastDate),
          status: data.status || "upcoming",
          totalCollected: data.totalCollected ?? 0,
        };
      });
      draw(rounds);
    })
    .catch(() => {
      clearTimeout(stallTimer);
      draw([]);
    });

  function draw(rounds) {
    if (rounds.length === 0) {
      return listHost.replaceChildren(
        EmptyState({
          title: "No rounds published yet",
          body: "Round summaries appear here once the admin publishes them.",
        }),
      );
    }

    const current = rounds.find((r) => r.status === "active");

    listHost.replaceChildren(
      el(
        "div.stack",
        current
          ? Card({
              body: el(
                "div",
                el("div.stat-label", "Current round"),
                el("h2", { style: { fontSize: "var(--text-2xl)" } }, current.groomName),
                el(
                  "p.small.muted",
                  { style: { marginTop: "var(--s1)" } },
                  `Kuri ${current.kuriNumber} · Nikah ${fmtDate(current.nikahDate)} · collect by ${fmtDate(current.kuriLastDate)}`,
                ),
                el(
                  "div",
                  { style: { marginTop: "var(--s4)" } },
                  Money(current.totalCollected, { size: "hero", tone: "paid" }),
                  el("div.stat-note", "collected so far"),
                ),
              ),
            })
          : null,
        Card({
          title: "All rounds",
          padded: false,
          body: el(
            "div.ledger",
            rounds.map((r) =>
              el(
                "div.ledger-row",
                el("span.avatar", String(r.kuriNumber)),
                el(
                  "div.ledger-main",
                  el("div.ledger-title", r.groomName),
                  el("div.ledger-meta", fmtDate(r.nikahDate)),
                ),
                Money(r.totalCollected, { tone: "paid" }),
                Badge(r.status, r.status === "completed" ? "paid" : "pending"),
              ),
            ),
          ),
        }),
        el(
          "p.xs.muted",
          { style: { textAlign: "center" } },
          "Round totals only. Individual contributions are visible to members after signing in.",
        ),
      ),
    );
  }
}
