import { el, Card, EmptyState, Skeleton } from "../lib/ui.js";
import { fmtDateTime } from "../lib/format.js";
import { col, auditFrom } from "../lib/collections.js";
import { onSnapshot, orderBy, query } from "../lib/fs.js";
import { memberName } from "../lib/data.js";

export function renderAudit(host) {
  host.replaceChildren(Skeleton(4));

  // Not part of the three live listeners — the audit log is rarely opened and
  // grows without bound, so it subscribes only while this page is on screen.
  return onSnapshot(
    query(col("auditLog"), orderBy("changedAt", "desc")),
    (snap) => {
      const entries = snap.docs.map(auditFrom);

      if (entries.length === 0) {
        return host.replaceChildren(
          EmptyState({
            title: "Nothing has been changed",
            body: "Every correction to a closed round is recorded here, permanently.",
          }),
        );
      }

      host.replaceChildren(
        Card({
          title: `${entries.length} changes`,
          padded: false,
          body: el(
            "div.ledger",
            entries.map((e) =>
              el(
                "div.ledger-row",
                el(
                  "div.ledger-main",
                  el("div.ledger-title", `${e.targetType} · ${e.field}`),
                  el(
                    "div.ledger-meta",
                    `${memberName(e.changedByMemberId)} · ${fmtDateTime(e.changedAt)} · ${e.reason}`,
                  ),
                ),
                el(
                  "div.small",
                  { style: { textAlign: "right" } },
                  el("span.money.sm.muted", String(e.oldValue)),
                  el("span.muted", " → "),
                  el("span.money.sm", String(e.newValue)),
                ),
              ),
            ),
          ),
        }),
      );
    },
    (err) => host.replaceChildren(EmptyState({ title: "Could not load", body: err.message })),
  );
}
