#!/usr/bin/env python3
"""Builds a client-ready 'FarmStack Tally Sync Setup Guide' PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    KeepTogether,
)

# ---- palette ---------------------------------------------------------------
GREEN = colors.HexColor("#15803d")
GREEN_DK = colors.HexColor("#14532d")
INK = colors.HexColor("#1f2937")
MUTE = colors.HexColor("#6b7280")
CODE_BG = colors.HexColor("#0f172a")
CODE_FG = colors.HexColor("#e2e8f0")
WARN_BG = colors.HexColor("#fef2f2")
WARN_BD = colors.HexColor("#fecaca")
WARN_TX = colors.HexColor("#991b1b")
NOTE_BG = colors.HexColor("#eff6ff")
NOTE_BD = colors.HexColor("#bfdbfe")
NOTE_TX = colors.HexColor("#1e40af")
TIP_BG = colors.HexColor("#f0fdf4")
TIP_BD = colors.HexColor("#bbf7d0")
SHOT_BG = colors.HexColor("#f8fafc")
SHOT_BD = colors.HexColor("#cbd5e1")
ROW_ALT = colors.HexColor("#f9fafb")

ss = getSampleStyleSheet()

def S(name, **kw):
    kw.setdefault("parent", ss["Normal"])
    return ParagraphStyle(name, **kw)

body = S("body", fontName="Helvetica", fontSize=10.5, leading=15.5, textColor=INK, spaceAfter=6)
h1 = S("h1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=GREEN_DK, spaceBefore=14, spaceAfter=4)
h2 = S("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=GREEN, spaceBefore=10, spaceAfter=3)
small = S("small", fontName="Helvetica", fontSize=9, leading=12.5, textColor=MUTE)
code = S("code", fontName="Courier-Bold", fontSize=10.5, leading=15, textColor=CODE_FG)
callout = S("callout", fontName="Helvetica", fontSize=10, leading=14.5, textColor=INK)
shotcap = S("shotcap", fontName="Helvetica-Oblique", fontSize=9, leading=12, textColor=MUTE, alignment=TA_CENTER)
liststyle = S("li", parent=body, leftIndent=14, bulletIndent=2, spaceAfter=3)

def bullet(txt):
    return Paragraph(f"&bull;&nbsp;&nbsp;{txt}", liststyle)

def cmd(text):
    """Dark terminal-style command box."""
    p = Paragraph(text, code)
    t = Table([[p]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("TEXTCOLOR", (0, 0), (-1, -1), CODE_FG),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    return t

def box(label, text, bg, bd, tx):
    inner = Paragraph(f"<b>{label}</b>&nbsp;&nbsp;{text}", S("c", parent=callout, textColor=tx))
    t = Table([[inner]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 1, bd),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t

def warn(t): return box("⚠  IMPORTANT", t, WARN_BG, WARN_BD, WARN_TX)
def note(t): return box("ℹ  NOTE", t, NOTE_BG, NOTE_BD, NOTE_TX)
def tip(t):  return box("✔  TIP", t, TIP_BG, TIP_BD, GREEN_DK)

def shot(caption, h=46 * mm):
    """A labelled placeholder box where a screenshot should be pasted."""
    ph = Paragraph("[ Screenshot ]", S("ph", fontName="Helvetica-Bold", fontSize=10,
                                        textColor=SHOT_BD, alignment=TA_CENTER))
    inner = Table([[ph]], colWidths=[165 * mm], rowHeights=[h])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SHOT_BG),
        ("BOX", (0, 0), (-1, -1), 1, SHOT_BD),
        ("DASHES", (0, 0), (-1, -1)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    cap = Paragraph(f"▲ {caption}", shotcap)
    return KeepTogether([inner, Spacer(1, 3), cap, Spacer(1, 8)])

def hr():
    return HRFlowable(width="100%", thickness=0.7, color=colors.HexColor("#e5e7eb"),
                      spaceBefore=8, spaceAfter=8)

story = []

# ---- cover -----------------------------------------------------------------
story.append(Spacer(1, 30 * mm))
story.append(Paragraph("FarmStack", S("brand", fontName="Helvetica-Bold", fontSize=30,
                                       textColor=GREEN, alignment=TA_CENTER)))
story.append(Spacer(1, 2 * mm))
story.append(Paragraph("Tally Sync — Computer Setup Guide", S("sub", fontName="Helvetica-Bold",
             fontSize=15, textColor=INK, alignment=TA_CENTER)))
story.append(Spacer(1, 4 * mm))
story.append(Paragraph("How to connect this computer's TallyPrime to FarmStack, one time.<br/>"
                       "After this setup, it keeps working on its own — nothing to do daily.",
                       S("cov", parent=body, alignment=TA_CENTER, textColor=MUTE)))
story.append(Spacer(1, 10 * mm))
story.append(HRFlowable(width="55%", thickness=2, color=GREEN, hAlign="CENTER"))
story.append(Spacer(1, 8 * mm))

# how it works
story.append(Paragraph("How it works (in one line)", S("hw", parent=h2, alignment=TA_CENTER)))
flow = Table([[
    Paragraph("<b>TallyPrime</b><br/>on this PC", S("f", parent=small, alignment=TA_CENTER, textColor=INK)),
    Paragraph("&rarr;", S("a", parent=h1, alignment=TA_CENTER, textColor=GREEN)),
    Paragraph("<b>Tailscale</b><br/>secure link", S("f", parent=small, alignment=TA_CENTER, textColor=INK)),
    Paragraph("&rarr;", S("a", parent=h1, alignment=TA_CENTER, textColor=GREEN)),
    Paragraph("<b>FarmStack</b><br/>on the web", S("f", parent=small, alignment=TA_CENTER, textColor=INK)),
]], colWidths=[40*mm, 12*mm, 40*mm, 12*mm, 40*mm])
flow.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("BACKGROUND", (0, 0), (0, 0), TIP_BG), ("BOX", (0, 0), (0, 0), 1, TIP_BD),
    ("BACKGROUND", (2, 0), (2, 0), NOTE_BG), ("BOX", (2, 0), (2, 0), 1, NOTE_BD),
    ("BACKGROUND", (4, 0), (4, 0), colors.HexColor("#faf5ff")), ("BOX", (4, 0), (4, 0), 1, colors.HexColor("#e9d5ff")),
    ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
]))
story.append(flow)
story.append(Spacer(1, 6 * mm))
story.append(Paragraph("Tailscale is a small free program that lets FarmStack on the internet reach "
                       "the Tally running on this computer — safely, with a fixed address that never "
                       "changes. You set it up once.", S("cw", parent=small, alignment=TA_CENTER)))

# time chip
story.append(Spacer(1, 8 * mm))
story.append(Paragraph("⏱  One-time setup: about 15 minutes", S("tm", fontName="Helvetica-Bold",
             fontSize=11, textColor=GREEN_DK, alignment=TA_CENTER)))

# ---- page 2: steps ---------------------------------------------------------
story.append(Spacer(1, 0))
from reportlab.platypus import PageBreak
story.append(PageBreak())

story.append(Paragraph("What you need before starting", h1))
story.append(bullet("This computer (the one that has <b>TallyPrime</b> installed)."))
story.append(bullet("An internet connection."))
story.append(bullet("Your FarmStack login (the website address)."))
story.append(bullet("A Tailscale account — free. You can make one with Google or email."))
story.append(hr())

# Step 1
story.append(Paragraph("Step 1 — Install Tailscale", h1))
story.append(Paragraph("Open a web browser and go to:", body))
story.append(cmd("tailscale.com/download/windows"))
story.append(Spacer(1, 4))
story.append(Paragraph("Click <b>Download</b>, then run the installer (Next &rarr; Install &rarr; Finish). "
                       "When it finishes, a small Tailscale icon appears near the clock (bottom-right).", body))
story.append(shot("The Tailscale download page — click the Download button."))

# Step 2
story.append(Paragraph("Step 2 — Sign in and connect", h1))
story.append(Paragraph("Open <b>PowerShell</b> (Start menu &rarr; type <i>PowerShell</i> &rarr; Enter) and type:", body))
story.append(cmd("tailscale up"))
story.append(Spacer(1, 4))
story.append(Paragraph("A browser window opens — sign in (Google / email) and click <b>Connect</b> / "
                       "<b>Approve</b>. When done, the Tailscale icon shows <b>Connected</b>.", body))
story.append(shot("Browser sign-in / approve screen, then the 'Connected' state.", h=44*mm))

# Step 3
story.append(Paragraph("Step 3 — Turn on the secure link (Funnel)", h1))
story.append(Paragraph("Still in PowerShell, type:", body))
story.append(cmd("tailscale funnel --bg 9000"))
story.append(Spacer(1, 4))
story.append(Paragraph("The first time, it may say <i>“Funnel is not enabled”</i> and show a link. "
                       "Open that link in the browser, click to enable Funnel, then run the command "
                       "<b>again</b>.", body))
story.append(Spacer(1, 2))
story.append(Paragraph("When it works you'll see <b>Success</b> and a web address ending in "
                       "<b>.ts.net</b>, like:", body))
story.append(cmd("https://this-pc.tailXXXX.ts.net/"))
story.append(Spacer(1, 4))
story.append(tip("<b>Write down / copy that .ts.net address.</b> You'll paste it into FarmStack in Step 5. "
                 "It belongs to <i>this</i> computer and never changes."))
story.append(shot("PowerShell showing 'Success' and the https://….ts.net address.", h=40*mm))

# Step 4
story.append(Paragraph("Step 4 — Switch on Tally's connection", h1))
story.append(Paragraph("In <b>TallyPrime</b>, the built-in server must be ON so FarmStack can talk to it:", body))
story.append(bullet("Open TallyPrime &rarr; press <b>F1</b> &rarr; <b>Settings</b> &rarr; <b>Connectivity</b>."))
story.append(bullet("Set <b>“TallyPrime acts as Server”</b> to <b>Yes</b>, with <b>Port 9000</b>."))
story.append(bullet("Save."))
story.append(Spacer(1, 2))
story.append(note("Quick check: open <b>http://localhost:9000</b> in a browser on this PC. If Tally's "
                  "server is on, you'll get a response instead of an error."))
story.append(shot("Tally Connectivity settings — 'acts as Server: Yes', Port 9000."))

# Step 5
story.append(Paragraph("Step 5 — Tell FarmStack the address", h1))
story.append(bullet("On <b>this</b> computer, open the <b>FarmStack</b> website in the browser the "
                    "client will use every day."))
story.append(bullet("Go to the <b>Tally Sync</b> page."))
story.append(bullet("Paste the <b>https://….ts.net</b> address from Step 3 into the Tally server URL box."))
story.append(bullet("Click <b>Save</b>, then <b>Check / Test connection</b> — it should say connected."))
story.append(Spacer(1, 2))
story.append(warn("The address is saved <b>inside that browser</b>. If the client uses a different "
                  "browser or computer for FarmStack, set the same address there too."))
story.append(shot("FarmStack → Tally Sync page with the address pasted and 'Connected'.", h=44*mm))

# ---- page: important + daily ----------------------------------------------
story.append(PageBreak())

story.append(Paragraph("One last setting — do not skip this", h1))
story.append(Paragraph("By default Tailscale logs out after about 6 months, which would quietly stop "
                       "syncing. Turn that off so it stays connected forever:", body))
story.append(bullet("On any browser, go to <b>login.tailscale.com/admin/machines</b>."))
story.append(bullet("Find this computer in the list &rarr; click the <b>&#8230; (three dots)</b> menu."))
story.append(bullet("Choose <b>Disable key expiry</b>."))
story.append(warn("If you skip this, sync will silently break in a few months and need a re-login."))
story.append(shot("Admin → Machines → ⋯ menu → 'Disable key expiry'."))
story.append(hr())

story.append(Paragraph("That's it — what happens day to day", h1))
story.append(bullet("Turn on the computer &rarr; Tailscale starts by itself."))
story.append(bullet("Open <b>TallyPrime</b> and keep it running while working."))
story.append(bullet("Use FarmStack normally. Sales and purchases sync to Tally automatically — the "
                    "status turns to <b>Synced</b> on its own."))
story.append(tip("If Tally is closed or the PC is off when an invoice is made, it simply waits as "
                 "<b>Failed</b> and <b>pushes itself automatically</b> the next time Tally is open and "
                 "online. Nothing is ever lost."))
story.append(hr())

# Troubleshooting
story.append(Paragraph("If something doesn't work", h1))
rows = [
    [Paragraph("<b>Problem</b>", S("th", parent=small, textColor=colors.white)),
     Paragraph("<b>What to do</b>", S("th", parent=small, textColor=colors.white))],
    [Paragraph("Status stays <b>Failed</b>", small),
     Paragraph("Make sure TallyPrime is <b>open</b> and its server is on (Step 4). It retries on its own.", small)],
    [Paragraph("<b>'tailscale' is not recognized</b>", small),
     Paragraph("Close and reopen PowerShell, or run it as: "
               "<font name='Courier'>\"C:\\Program Files\\Tailscale\\tailscale.exe\" funnel --bg 9000</font>", small)],
    [Paragraph("<b>'Tailscale is stopped'</b>", small),
     Paragraph("Run <font name='Courier'>tailscale up</font> first, then the funnel command again.", small)],
    [Paragraph("Test connection fails in FarmStack", small),
     Paragraph("Re-check the .ts.net address is pasted exactly, Tally is open, and "
               "http://localhost:9000 responds on this PC.", small)],
    [Paragraph("Need to turn the link off", small),
     Paragraph("<font name='Courier'>tailscale funnel --https=443 off</font>", small)],
]
tt = Table(rows, colWidths=[55 * mm, 110 * mm])
tt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), GREEN),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.append(tt)

story.append(Spacer(1, 8 * mm))
story.append(Paragraph("Setup checklist", h2))
for c in ["Tailscale installed",
          "Signed in &amp; Connected (tailscale up)",
          "Funnel running — got the https://….ts.net address",
          "Tally server ON (Port 9000)",
          "Address pasted into FarmStack → Tally Sync, test = connected",
          "Key expiry disabled in the admin page"]:
    story.append(Paragraph(f"&#9744;&nbsp;&nbsp;{c}", liststyle))

story.append(Spacer(1, 10 * mm))
story.append(HRFlowable(width="100%", thickness=0.7, color=colors.HexColor("#e5e7eb")))
story.append(Paragraph("FarmStack — Tally Sync Setup Guide", S("foot", parent=small, alignment=TA_CENTER)))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTE)
    canvas.drawString(20 * mm, 12 * mm, "FarmStack — Tally Sync Setup")
    canvas.drawRightString(190 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    "FarmStack-Tally-Setup-Guide.pdf", pagesize=A4,
    leftMargin=22 * mm, rightMargin=22 * mm, topMargin=18 * mm, bottomMargin=20 * mm,
    title="FarmStack — Tally Sync Setup Guide", author="FarmStack",
)
doc.build(story, onLaterPages=footer, onFirstPage=lambda c, d: None)
print("OK: FarmStack-Tally-Setup-Guide.pdf")
