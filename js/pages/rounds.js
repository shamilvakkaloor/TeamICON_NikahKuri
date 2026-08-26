import {
  el,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Money,
  Notice,
  Row,
  Select,
  openDialog,
  toast,
} from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { fmtDate } from "../lib/format.js";
import { data, dataStore, memberById, nextKuriNumber } from "../lib/data.js";
import { createRound } from "../lib/crud.js";
import { isAdmin } from "../lib/auth.js";

const STATUS_TONE = { completed: "paid", active: "pending", upcoming: "" };

export function renderRounds(host) {
  const unsub = dataStore.subscribe(draw);

  function draw() {
    const { rounds, members, payments } = data();
    const sorted = [...rounds].sort((a, b) => b.kuriNumber - a.kuriNumber);
    const hasOpen = rounds.some((r) => r.status === "active");
    const completed = rounds.filter((r) => r.status === "completed").length;

    host.replaceChildren(
      el(
        "div.stack",
        isAdmin()
          ? el(
              "div.row.between.wrap",
              el("span.small.muted", `${completed} of ${members.length} members have had their round`),
              (() => {
                const b = Button("Open a round", {
                  onClick: () => openCreateDialog(),
                  disabled: hasOpen,
                  title: hasOpen ? "Close the open round first" : "",
                });
                b.prepend(icon("plus", 16));
                return b;
              })(),
            )
          : null,
        hasOpen && isAdmin()
          ? Notice("One round runs at a time. Close the open round before opening the next.")
          : null,
        sorted.length === 0
          ? EmptyState({
              title: "No rounds yet",
              body: "The first round starts when the admin assigns a groom.",
            })
          : Card({
              padded: false,
              body: el(
                "div.ledger",
                sorted.map((r) => {
                  const groom = memberById(r.groomMemberId);
                  const collected = payments
                    .filter((p) => p.kuriId === r.id)
                    .reduce((t, p) => t + p.amount, 0);

                  const link = el("a.ledger-row.plain", { href: `#/rounds/${r.id}` });
                  link.append(
                    el("span.avatar", String(r.kuriNumber)),
                    el(
                      "div.ledger-main",
                      el("div.ledger-title", groom?.name || "Unassigned"),
                      el(
                        "div.ledger-meta",
                        `Nikah ${fmtDate(r.nikahDate)} · Last date ${fmtDate(r.kuriLastDate)}`,
                      ),
                    ),
                    el(
                      "div",
                      { style: { textAlign: "right" } },
                      Money(collected, { tone: "paid" }),
                      el("div", { style: { marginTop: "2px" } }, Badge(r.status, STATUS_TONE[r.status])),
                    ),
                  );
                  return link;
                }),
              ),
            }),
      ),
    );
  }

  return unsub;
}

function openCreateDialog() {
  const { members, rounds } = data();
  const kuriNumber = nextKuriNumber();

  // Rule 8: one round per member. Anyone who has already been groom is out.
  const pastGrooms = new Set(rounds.map((r) => r.groomMemberId));
  const eligible = members.filter((m) => !pastGrooms.has(m.id) && m.status === "active");

  const state = { groomMemberId: "", nikahDate: "", kuriLastDate: "", busy: false, error: null };
  const noticeHost = el("div");

  function updateNotice() {
    const groom = members.find((m) => m.id === state.groomMemberId);
    noticeHost.replaceChildren();
    if (!groom) return;

    // Rule 30: a late joiner collects from fewer members. Say so up front so
    // nobody is surprised on the day.
    const contributors = members.filter(
      (m) => m.id !== groom.id && m.status === "active" && m.joinedAtKuriNumber <= kuriNumber,
    ).length;

    noticeHost.append(
      Notice(
        `${groom.name} collects from up to ${contributors} members.` +
          (groom.joinedAtKuriNumber > 1
            ? ` He joined at Kuri ${groom.joinedAtKuriNumber}, so grooms of earlier rounds owe him nothing — his pot is smaller by design.`
            : "") +
          " Review the generated dues on the round page before telling anyone the figure.",
        groom.joinedAtKuriNumber > 1 ? "warn" : "info",
      ),
    );
  }

  const errorHost = el("div");

  const close = openDialog({
    title: `Open Kuri ${kuriNumber}`,
    body: el(
      "div.stack",
      errorHost,
      Field({
        label: "Groom",
        hint: "Only members who have not yet had a round appear here.",
        control: Select(
          eligible.map((m) => ({
            value: m.id,
            label: `${m.name} — ${m.team}${m.joinedAtKuriNumber > 1 ? ` (joined at Kuri ${m.joinedAtKuriNumber})` : ""}`,
          })),
          {
            placeholder: "Select a member…",
            onChange: (v) => {
              state.groomMemberId = v;
              updateNotice();
            },
          },
        ),
      }),
      el(
        "div.form-grid.two",
        Field({
          label: "Nikah date",
          control: Input({
            type: "date",
            oninput: (e) => {
              state.nikahDate = e.target.value;
            },
          }),
        }),
        Field({
          label: "Kuri last date",
          hint: "Money must be in before this.",
          control: Input({
            type: "date",
            oninput: (e) => {
              state.kuriLastDate = e.target.value;
            },
          }),
        }),
      ),
      noticeHost,
    ),
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Open round", { onClick: submit }),
    ],
  });

  async function submit() {
    errorHost.replaceChildren();
    if (!state.groomMemberId || !state.nikahDate || !state.kuriLastDate) {
      errorHost.append(Notice("Groom and both dates are required.", "danger"));
      return;
    }
    if (state.busy) return;
    state.busy = true;

    try {
      await createRound({
        kuriNumber,
        groomMemberId: state.groomMemberId,
        nikahDate: new Date(state.nikahDate).getTime(),
        kuriLastDate: new Date(state.kuriLastDate).getTime(),
        status: "active",
      });
      toast(`Kuri ${kuriNumber} is open.`, "success");
      close();
    } catch (e) {
      state.busy = false;
      errorHost.append(Notice(e?.message || "Could not create the round.", "danger"));
    }
  }
}
