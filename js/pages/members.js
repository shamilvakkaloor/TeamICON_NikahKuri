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
  Radio,
  Select,
  TeamDot,
  openDialog,
  toast,
} from "../lib/ui.js";
import { icon } from "../lib/icons.js";
import { money } from "../lib/format.js";
import { data, dataStore, nextKuriNumber } from "../lib/data.js";
import { currentMember, isAdmin } from "../lib/auth.js";
import { createMember, fetchContacts, setContact, updateMember } from "../lib/crud.js";
import { DEFAULT_AMOUNT, TEAMS } from "../domain/ledger.js";
import { openImportDialog } from "../components/import-members.js";
import { downloadCsv } from "../lib/csv.js";

/**
 * Exports in the same shape the importer reads, so a roster can be pulled
 * out, edited in a spreadsheet, and brought back.
 */
function exportRoster(contacts) {
  const { members } = data();
  downloadCsv(
    `nikah-kuri-members-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Name", "Team", "Email", "Mobile", "Joined at Kuri", "Standing amount", "Role", "Photo URL"],
    members.map((m) => [
      m.name,
      m.team,
      m.email,
      contacts.get(m.id) || "",
      m.joinedAtKuriNumber,
      m.standingAmount,
      m.role,
      m.photoUrl || "",
    ]),
  );
}

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
            ? el(
                "div.row.wrap",
                { style: { gap: "var(--s2)" } },
                (() => {
                  const b = Button("Export CSV", {
                    variant: "outline",
                    size: "sm",
                    disabled: members.length === 0,
                    onClick: () => exportRoster(state.contacts),
                  });
                  b.prepend(icon("download", 14));
                  return b;
                })(),
                Button("Import CSV", {
                  variant: "outline",
                  size: "sm",
                  onClick: () => openImportDialog({ onImported: refresh }),
                }),
                (() => {
                  const b = Button("Add member", { onClick: () => openMemberDialog({ onSaved: refresh }) });
                  b.prepend(icon("plus", 16));
                  return b;
                })(),
              )
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

  /**
   * There may be more than one admin, but only on purpose.
   *
   * Promoting someone used to demote whoever held the role, silently. That is
   * a bad default in both directions: it surprises the person doing it, and
   * stepping down is the one change an admin cannot undo on their own. So the
   * choice is explicit, and the non-destructive option leads.
   */
  const me = currentMember();
  const otherAdmins = members.filter((m) => m.role === "admin" && m.id !== member?.id);
  const editingSelf = Boolean(member && me && member.id === me.id);
  const canHandOver = Boolean(me && me.role === "admin" && !editingSelf);
  state.adminMode = "add";

  function drawAdminWarning() {
    const promoting = state.role === "admin" && member?.role !== "admin";

    if (!promoting || otherAdmins.length === 0) {
      return adminWarningHost.replaceChildren(
        state.role === "admin" && otherAdmins.length === 0 && !editingSelf
          ? Notice(`${state.name || "This member"} becomes the admin.`, "info")
          : null,
      );
    }

    adminWarningHost.replaceChildren(
      Field({
        label: "There is already an admin",
        control: el(
          "div.stack",
          { style: { gap: "var(--s2)" } },
          Radio(
            `Add as an additional admin — ${otherAdmins.map((a) => a.name).join(", ")} keeps the role too`,
            {
              name: "adminMode",
              checked: state.adminMode === "add",
              onChange: () => {
                state.adminMode = "add";
                drawAdminWarning();
              },
            },
          ),
          canHandOver
            ? Radio(`Hand over — you (${me.name}) drop to ordinary member`, {
                name: "adminMode",
                checked: state.adminMode === "handover",
                onChange: () => {
                  state.adminMode = "handover";
                  drawAdminWarning();
                },
              })
            : null,
        ),
      }),
      state.adminMode === "handover"
        ? Notice(
            "You lose admin access the moment this saves, and you cannot give it back to " +
              "yourself. Only do this if you mean to stop running the kuri.",
            "warn",
          )
        : Notice(
            "Both of you will be able to add members, open rounds, record payments and run " +
              "settlement. Every change is still recorded against whoever made it.",
            "info",
          ),
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
          hint: "What he gives in future rounds. To change one round only, open that round.",
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
      // Leaving is not a delete — a member who has taken his round owes money
      // back, so it runs through settlement rather than removing a record.
      member && member.status !== "exited"
        ? Button("Leave the kuri…", {
            variant: "ghost",
            onClick: () => {
              close();
              window.location.hash = `#/settlement/${member.id}`;
            },
          })
        : null,
      el("div", { style: { flex: "1" } }),
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

    // Nobody can remove the last admin. Without this, demoting yourself as the
    // only admin locks the whole group out of every write — there would be no
    // account left that could put it back.
    if (member?.role === "admin" && state.role !== "admin" && otherAdmins.length === 0) {
      errorHost.append(
        Notice(
          `${member.name} is the only admin. Make someone else an admin first, then change this.`,
          "danger",
        ),
      );
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
      const handingOver =
        state.role === "admin" &&
        member?.role !== "admin" &&
        otherAdmins.length > 0 &&
        state.adminMode === "handover" &&
        canHandOver;

      if (handingOver) {
        // Passing `me` re-syncs the index entry, which is what actually
        // removes the access — the rules read the role from there, not from
        // the member document.
        await updateMember(me.id, { role: "member" }, me);
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

      toast(
        handingOver
          ? `${state.name.trim()} is now the admin. You are an ordinary member.`
          : member
            ? "Member updated."
            : "Member added.",
        "success",
      );
      close();
      onSaved();
    } catch (e) {
      errorHost.append(Notice(e?.message || "Could not save.", "danger"));
    }
  }
}
