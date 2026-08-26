import {
  el,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Money,
  MoneyInput,
  Notice,
  Select,
  TeamDot,
  openDialog,
  toast,
} from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { money } from "../lib/format.js";
import { data, dataStore, nextKuriNumber } from "../lib/data.js";
import { isAdmin } from "../lib/auth.js";
import { createMember, fetchContacts, setContact, updateMember } from "../lib/crud.js";
import { DEFAULT_AMOUNT, TEAMS } from "../domain/ledger.js";

export function renderMembers(host) {
  const state = { team: "ALL", contacts: new Map() };
  const unsub = dataStore.subscribe(draw);

  // Only the admin can read this path; everyone else quietly gets an empty map.
  if (isAdmin()) {
    fetchContacts().then((c) => {
      state.contacts = c;
      draw();
    });
  }

  const refresh = () => {
    if (isAdmin()) {
      fetchContacts().then((c) => {
        state.contacts = c;
        draw();
      });
    } else {
      draw();
    }
  };

  function draw() {
    const { members, rounds, payments } = data();
    const shown = state.team === "ALL" ? members : members.filter((m) => m.team === state.team);
    const pastGrooms = new Set(
      rounds.filter((r) => r.status === "completed").map((r) => r.groomMemberId),
    );

    host.replaceChildren(
      el(
        "div.stack",
        el(
          "div.row.wrap.between",
          el("span.small.muted", `${members.length} members`),
          isAdmin()
            ? (() => {
                const b = Button("Add member", { onClick: () => openMemberDialog({ onSaved: refresh }) });
                b.prepend(icon("plus", 16));
                return b;
              })()
            : null,
        ),
        el(
          "div.pill-row",
          el(
            `button.pill${state.team === "ALL" ? ".active" : ""}`,
            {
              onclick: () => {
                state.team = "ALL";
                draw();
              },
            },
            "All teams",
          ),
          TEAMS.map((t) =>
            el(
              `button.pill${state.team === t ? ".active" : ""}`,
              {
                onclick: () => {
                  state.team = t;
                  draw();
                },
              },
              t,
            ),
          ),
        ),
        shown.length === 0
          ? EmptyState({
              title: "No members yet",
              body: "Add the group one at a time — name, team and the Google email they sign in with.",
            })
          : Card({
              padded: false,
              body: el(
                "div.ledger",
                shown.map((m) => {
                  const paidOut = payments
                    .filter((p) => p.fromMemberId === m.id)
                    .reduce((t, p) => t + p.amount, 0);

                  const title = el("div.ledger-title", m.name);
                  if (m.role !== "member") title.append(" ", Badge(m.role, "info"));
                  if (pastGrooms.has(m.id)) title.append(" ", Badge("had his round", "gold"));

                  const mobile = state.contacts.get(m.id);
                  const meta = el("div.ledger-meta", TeamDot(m.team), ` ${m.team}`);
                  if (m.joinedAtKuriNumber > 1) meta.append(` · joined at Kuri ${m.joinedAtKuriNumber}`);
                  if (m.standingAmount !== DEFAULT_AMOUNT) {
                    meta.append(` · standing ${money(m.standingAmount)}`);
                  }
                  if (isAdmin() && mobile) meta.append(` · ${mobile}`);

                  return el(
                    `div.ledger-row${m.status === "exited" ? ".dim" : ""}`,
                    Avatar(m.name, m.photoUrl),
                    el("div.ledger-main", title, meta),
                    el(
                      "div",
                      { style: { textAlign: "right" } },
                      Money(paidOut, { size: "sm", tone: "muted" }),
                      el("div.xs.muted", "paid in total"),
                    ),
                    isAdmin()
                      ? Button("Edit", {
                          variant: "ghost",
                          size: "sm",
                          onClick: () =>
                            openMemberDialog({
                              member: m,
                              mobile: state.contacts.get(m.id) || "",
                              onSaved: refresh,
                            }),
                        })
                      : null,
                  );
                }),
              ),
            }),
        !isAdmin()
          ? el(
              "p.xs.muted",
              "Mobile numbers are visible to the admin only — they’re contact details, not payment data.",
            )
          : null,
      ),
    );
  }

  return unsub;
}

function openMemberDialog({ member, mobile = "", onSaved }) {
  const { members } = data();
  const state = {
    name: member?.name || "",
    team: member?.team || "KOZHIKODE",
    email: member?.email || "",
    mobile,
    role: member?.role || "member",
    photoUrl: member?.photoUrl || "",
    joinedAt: String(member?.joinedAtKuriNumber ?? nextKuriNumber()),
    standing: String(member?.standingAmount ?? DEFAULT_AMOUNT),
  };

  const errorHost = el("div");
  const adminWarningHost = el("div");

  // Exactly one admin at any time. Promoting someone demotes the incumbent.
  const currentAdmin = members.find((m) => m.role === "admin" && m.id !== member?.id);

  function drawAdminWarning() {
    adminWarningHost.replaceChildren(
      state.role === "admin" && currentAdmin
        ? Notice(
            `There can only be one admin. Saving this hands the role over — ${currentAdmin.name} ` +
              "drops to ordinary member immediately.",
            "warn",
          )
        : null,
    );
  }
  drawAdminWarning();

  const close = openDialog({
    title: member ? `Edit ${member.name}` : "Add member",
    body: el(
      "div.stack",
      errorHost,
      Field({
        label: "Name",
        control: Input({
          value: state.name,
          oninput: (e) => {
            state.name = e.target.value;
          },
        }),
      }),
      el(
        "div.form-grid.two",
        Field({
          label: "Team",
          hint: "Members do not change teams.",
          control: Select(
            TEAMS.map((t) => ({ value: t, label: t })),
            {
              value: state.team,
              onChange: (v) => {
                state.team = v;
              },
            },
          ),
        }),
        Field({
          label: "Role",
          control: Select(
            [
              { value: "member", label: "Member" },
              { value: "coordinator", label: "Team coordinator" },
              { value: "admin", label: "Admin" },
            ],
            {
              value: state.role,
              onChange: (v) => {
                state.role = v;
                drawAdminWarning();
              },
            },
          ),
        }),
      ),
      Field({
        label: "Google account email",
        hint: "Used to sign in. Must match exactly.",
        control: Input({
          type: "email",
          value: state.email,
          oninput: (e) => {
            state.email = e.target.value;
          },
        }),
      }),
      Field({
        label: "Mobile",
        hint: "Stored separately — only the admin can read it.",
        control: Input({
          type: "tel",
          value: state.mobile,
          oninput: (e) => {
            state.mobile = e.target.value;
          },
        }),
      }),
      Field({
        label: "Photo URL (optional)",
        // Firebase Storage now needs the paid Blaze plan, so rather than force
        // that for one feature, a link to an already-hosted image works. The
        // groom's photo is the centrepiece of the home page.
        hint: "A direct link to an image. Anything publicly reachable works.",
        control: Input({
          type: "url",
          value: state.photoUrl,
          placeholder: "https://…",
          oninput: (e) => {
            state.photoUrl = e.target.value;
          },
        }),
      }),
      el(
        "div.form-grid.two",
        Field({
          label: "Joined at Kuri",
          hint: "He owes nothing to rounds before this, and they owe him nothing back. Cannot be changed later.",
          control: Input({
            type: "number",
            min: 1,
            value: state.joinedAt,
            disabled: Boolean(member),
            oninput: (e) => {
              state.joinedAt = e.target.value;
            },
          }),
        }),
        Field({
          label: "Standing amount",
          control: MoneyInput({
            value: state.standing,
            oninput: (e) => {
              state.standing = e.target.value;
            },
          }),
        }),
      ),
      adminWarningHost,
    ),
    footer: [
      Button("Cancel", { variant: "outline", onClick: () => close() }),
      Button("Save", { onClick: submit }),
    ],
  });

  async function submit() {
    errorHost.replaceChildren();
    if (!state.name.trim() || !state.email.trim()) {
      errorHost.append(Notice("Name and email are required.", "danger"));
      return;
    }

    const payload = {
      name: state.name.trim(),
      team: state.team,
      email: state.email.trim().toLowerCase(),
      role: state.role,
      photoUrl: state.photoUrl.trim(),
      joinedAtKuriNumber: Number(state.joinedAt) || 1,
      standingAmount: Number(state.standing) || DEFAULT_AMOUNT,
    };

    try {
      if (state.role === "admin" && currentAdmin) {
        // Handing over the admin role drops the incumbent to ordinary member.
        // Passing `currentAdmin` re-syncs his index entry, which is what
        // actually removes his access.
        await updateMember(currentAdmin.id, { role: "member" }, currentAdmin);
      }

      if (member) {
        await updateMember(member.id, payload, member);
        await setContact(member.id, state.mobile.trim());
      } else {
        const docRef = await createMember({
          ...payload,
          status: "active",
          hasBeenGroom: false,
          amountHistory: [],
        });
        // Contact details go to their own admin-only path, never the member doc.
        if (state.mobile.trim()) await setContact(docRef.id, state.mobile.trim());
      }

      toast(member ? "Member updated." : "Member added.", "success");
      close();
      onSaved();
    } catch (e) {
      errorHost.append(Notice(e?.message || "Could not save.", "danger"));
    }
  }
}
