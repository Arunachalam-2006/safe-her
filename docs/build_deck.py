"""
SAFE-HER — Hackathon presentation builder.

Generates a 13-slide 16:9 deck. Every technical claim is taken from the
repository source: the weights, the factor names, the routing approach, the SOS
capabilities and the data stores all match the code.

No fabricated screenshots, no invented statistics, no API keys.
Screenshot frames are left as clean, correctly-proportioned panels for the
presenter to drop real captures into.
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import copy

# ── Design tokens ──────────────────────────────────────────────────────
INK        = RGBColor(0x0F, 0x17, 0x2A)   # deep navy — primary text
INK_SOFT   = RGBColor(0x33, 0x41, 0x55)
MUTED      = RGBColor(0x64, 0x74, 0x8B)
FAINT      = RGBColor(0x94, 0xA3, 0xB8)
TEAL       = RGBColor(0x0E, 0xA5, 0xA4)   # brand accent
TEAL_DK    = RGBColor(0x0F, 0x76, 0x6E)
TEAL_PALE  = RGBColor(0xCC, 0xFB, 0xF1)
CYAN       = RGBColor(0x22, 0xD3, 0xEE)
PINK       = RGBColor(0xEC, 0x48, 0x99)   # SOS / women's safety
ROSE       = RGBColor(0xF4, 0x3F, 0x5E)
AMBER      = RGBColor(0xF5, 0x9E, 0x0B)
GREEN      = RGBColor(0x10, 0xB9, 0x81)
BLUE       = RGBColor(0x25, 0x63, 0xEB)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
PANEL      = RGBColor(0xF8, 0xFA, 0xFC)
PANEL2     = RGBColor(0xF1, 0xF5, 0xF9)
LINE       = RGBColor(0xE2, 0xE8, 0xF0)
SLATE_900  = RGBColor(0x0B, 0x12, 0x22)
SLATE_800  = RGBColor(0x14, 0x1D, 0x2E)

F  = "Segoe UI"
FB = "Segoe UI Black"
FS = "Segoe UI Semibold"
FM = "Consolas"

W, H = 13.333, 7.5
M = 0.62

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(W), Inches(H)
BLANK = prs.slide_layouts[6]


# ── Primitives ─────────────────────────────────────────────────────────
def slide(dark=False):
    s = prs.slides.add_slide(BLANK)
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(W), Inches(H))
    bg.fill.solid()
    bg.fill.fore_color.rgb = SLATE_900 if dark else WHITE
    bg.line.fill.background()
    bg.shadow.inherit = False
    return s


def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
         adj=0.10, shadow=False):
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        try:
            sh.adjustments[0] = adj
        except Exception:
            pass
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(lw)
    sh.shadow.inherit = False
    if shadow:
        sh.shadow.inherit = True
    return sh


def txt(s, x, y, w, h, text, size=14, color=INK, bold=False, font=F, align=PP_ALIGN.LEFT,
        anchor=MSO_ANCHOR.TOP, spacing=1.0, caps=False, italic=False):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = text.split("\n") if isinstance(text, str) else list(text)
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = ln.upper() if caps else ln
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.color.rgb = color
        r.font.name = font
    return tb


def header(s, kicker, title, dark=False):
    """Consistent slide header: small accent kicker + large title + rule."""
    tcol = WHITE if dark else INK
    if kicker:
        txt(s, M, 0.40, 9.0, 0.28, kicker, size=10.5, color=TEAL, bold=True, caps=True, font=FS)
    txt(s, M, 0.66, 12.1, 0.62, title, size=30, color=tcol, bold=True, font=F)
    rect(s, M, 1.34, 0.62, 0.045, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)


def footer(s, n, dark=False):
    c = FAINT if dark else MUTED
    txt(s, M, 6.98, 7.0, 0.26, "SAFE-HER  ·  Smart & Safer Journey Platform", size=8.5, color=c)
    txt(s, W - M - 1.2, 6.98, 1.2, 0.26, f"{n:02d}", size=8.5, color=c, align=PP_ALIGN.RIGHT, bold=True)


def notes(s, text):
    s.notes_slide.notes_text_frame.text = text


def arrow_d(s, x, y, h=0.30, color=FAINT):
    """Small downward chevron connector."""
    a = s.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(x), Inches(y), Inches(0.16), Inches(h))
    a.fill.solid(); a.fill.fore_color.rgb = color
    a.line.fill.background(); a.shadow.inherit = False
    return a


def arrow_r(s, x, y, w=0.34, color=FAINT):
    a = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x), Inches(y), Inches(w), Inches(0.16))
    a.fill.solid(); a.fill.fore_color.rgb = color
    a.line.fill.background(); a.shadow.inherit = False
    return a


def card(s, x, y, w, h, title, body=None, accent=TEAL, fill=PANEL,
         tsize=13, bsize=10, dark=False, icon=None):
    rect(s, x, y, w, h, fill=fill, line=None)
    rect(s, x, y, 0.055, h, fill=accent, shape=MSO_SHAPE.RECTANGLE)
    cy = y + 0.16
    if icon:
        txt(s, x + 0.20, cy, 0.4, 0.28, icon, size=13, color=accent, bold=True)
        cy += 0.30
    txt(s, x + 0.20, cy, w - 0.38, 0.30, title, size=tsize,
        color=(WHITE if dark else INK), bold=True, font=FS)
    if body:
        txt(s, x + 0.20, cy + 0.32, w - 0.38, h - (cy - y) - 0.42, body,
            size=bsize, color=(FAINT if dark else MUTED), spacing=1.22)


def pill(s, x, y, w, h, text, fill, tcolor=WHITE, size=9.5):
    rect(s, x, y, w, h, fill=fill, adj=0.5)
    txt(s, x, y + h / 2 - 0.10, w, 0.22, text, size=size, color=tcolor, bold=True,
        align=PP_ALIGN.CENTER, font=FS)


def node(s, x, y, w, h, label, sub=None, fill=WHITE, line=LINE, tcol=INK,
         scol=MUTED, size=10.5, ssize=8, bold=True):
    rect(s, x, y, w, h, fill=fill, line=line, lw=1.0)
    if sub:
        txt(s, x + 0.06, y + h / 2 - 0.26, w - 0.12, 0.24, label, size=size, color=tcol,
            bold=bold, align=PP_ALIGN.CENTER, font=FS)
        txt(s, x + 0.06, y + h / 2 + 0.00, w - 0.12, 0.30, sub, size=ssize, color=scol,
            align=PP_ALIGN.CENTER, spacing=1.05)
    else:
        txt(s, x + 0.06, y + h / 2 - 0.11, w - 0.12, 0.24, label, size=size, color=tcol,
            bold=bold, align=PP_ALIGN.CENTER, font=FS)


def phone(s, x, y, w, h, label, accent=TEAL, screen_fill=PANEL2, ratio=0.462,
          caption_color=INK):
    """
    Realistic phone frame with a correctly-proportioned screen area
    (9:19.5). The presenter drops a real screenshot over the inner panel.
    """
    ph = w / ratio                      # true device height from width
    rect(s, x, y, w, ph, fill=INK, adj=0.075)          # body
    rect(s, x, y, w, ph, fill=None, line=RGBColor(0x33, 0x41, 0x55), lw=1.25, adj=0.075)
    b = w * 0.035
    rect(s, x + b, y + b, w - 2 * b, ph - 2 * b, fill=screen_fill, adj=0.055)
    # notch
    nw = w * 0.30
    rect(s, x + w / 2 - nw / 2, y + b + w * 0.012, nw, w * 0.035,
         fill=INK, shape=MSO_SHAPE.ROUNDED_RECTANGLE, adj=0.5)
    # inner hint
    txt(s, x + b, y + ph / 2 - 0.20, w - 2 * b, 0.24, "Screenshot", size=7.5, color=FAINT,
        align=PP_ALIGN.CENTER, bold=True, font=FS, caps=True)
    txt(s, x + b, y + ph / 2 + 0.02, w - 2 * b, 0.24, label, size=7,
        color=FAINT, align=PP_ALIGN.CENTER)
    # caption — must contrast with the slide background it sits on
    txt(s, x - 0.12, y + ph + 0.10, w + 0.24, 0.26, label, size=9.5, color=caption_color,
        bold=True, align=PP_ALIGN.CENTER, font=FS)
    return ph


# ══════════════════════════════════════════════════════════════════════
# SLIDE 1 — TITLE
# ══════════════════════════════════════════════════════════════════════
s = slide(dark=True)
# ambient blocks
rect(s, 8.9, -1.2, 5.6, 5.6, fill=RGBColor(0x0C, 0x1F, 0x33), adj=0.5, shape=MSO_SHAPE.OVAL)
rect(s, 10.6, 3.4, 4.2, 4.2, fill=RGBColor(0x10, 0x24, 0x3A), adj=0.5, shape=MSO_SHAPE.OVAL)

# logo mark
rect(s, M, 1.42, 0.72, 0.72, fill=TEAL, adj=0.26)
txt(s, M, 1.55, 0.72, 0.46, "S", size=30, color=WHITE, bold=True, font=FB, align=PP_ALIGN.CENTER)

txt(s, M, 2.34, 8.4, 1.00, "SAFE-HER", size=58, color=WHITE, bold=True, font=FB)
rect(s, M, 3.42, 0.72, 0.05, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
txt(s, M, 3.68, 8.2, 0.44, "Smart & Safer Journey Platform for Women",
    size=19, color=TEAL, bold=True, font=FS)
txt(s, M, 4.30, 7.4, 0.80,
    "Three routes home. A safety score on each one.\nSo the choice is informed, not assumed.",
    size=12.5, color=FAINT, spacing=1.35)

pill(s, M, 5.34, 2.72, 0.30, "PROBLEM  →  SOLUTION  →  PROOF", SLATE_800, TEAL, 8.5)
txt(s, M, 5.82, 7.0, 0.30, "Hackathon  ·  Team Safe-Her  ·  github.com/Arunachalam-2006/safeher",
    size=9.5, color=MUTED)

# hero phone
phone(s, 10.05, 1.30, 2.30, 0, "Home — Live Safety Index",
      screen_fill=RGBColor(0x14, 0x1D, 0x2E), caption_color=WHITE)
footer(s, 1, dark=True)
notes(s, """OPENING — say this:

"Safe-Her is a smart and safer journey platform for women. The core idea is
simple: every navigation app today optimises for one thing — time. Safe-Her
optimises for something else as well. When you plan a route, we give you three
options, and each one carries a safety score out of a hundred, so you can
decide whether two extra minutes is worth a lit road."

Then: "In the next four minutes I'll show you the problem, the product, how
the score is actually calculated, and what's genuinely built versus planned."

Judge may ask: "Who is this for?"
Answer: "Women planning journeys, particularly after dark. The app also gives
citizens a way to report unsafe locations and an SOS that alerts their contacts
and our officer console."

Do NOT mention: AI/ML, automatic emergency dispatch. Both are not implemented.""")

# ══════════════════════════════════════════════════════════════════════
# SLIDE 2 — THE PROBLEM
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "01 — The problem", "A route is not just the shortest path")

txt(s, M, 1.52, 6.05, 0.30, "WHAT HAPPENS TONIGHT", size=10, color=PINK, bold=True, font=FS)
steps = [
    ("UNSAFE ROUTE", "The app picks the fastest road.\nNobody weighs whether it is lit."),
    ("NO LOCAL SAFETY DATA", "Lighting, police proximity and crowd\nlevels exist in OpenStreetMap — unused."),
    ("UNCERTAINTY", "She cannot compare options,\nso she guesses or stays home."),
    ("SLOW RESPONSE", "Hazards are reported by word of mouth.\nOfficers learn late, if at all."),
]
y = 1.88
for i, (t, b) in enumerate(steps):
    card(s, M, y, 6.05, 0.94, t, b, accent=PINK, fill=PANEL, tsize=12, bsize=9.5)
    if i < len(steps) - 1:
        arrow_d(s, M + 0.32, y + 0.96, 0.20, RGBColor(0xF9, 0xA8, 0xD4))
    y += 1.20

# right panel — the gap
rect(s, 7.10, 1.88, 5.62, 4.42, fill=PANEL, line=None)
txt(s, 7.42, 2.10, 5.0, 0.30, "THE GAP WE CLOSE", size=10, color=TEAL, bold=True, font=FS)
gaps = [
    ("Time-only ranking", "Every mainstream navigator returns one route, optimised for duration."),
    ("Black-box safety", "No app shows why a street feels unsafe, or scores it."),
    ("Siloed reporting", "A hazard reported by one woman is invisible to the next hundred."),
    ("Broken loop", "Citizens cannot see whether a report they filed was ever acted on."),
]
gy = 2.52
for t, b in gaps:
    rect(s, 7.42, gy + 0.06, 0.045, 0.62, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
    txt(s, 7.62, gy, 4.85, 0.24, t, size=11, color=INK, bold=True, font=FS)
    txt(s, 7.62, gy + 0.25, 4.85, 0.46, b, size=9, color=MUTED, spacing=1.18)
    gy += 0.86
footer(s, 2)
notes(s, """SAY:

"Walk through it. A woman opens her map at 11pm. The app returns the fastest
route — the one down the unlit service lane behind the market. There is no
lighting information, no proximity to help, no sense of how busy the street is.
She has two options: take the route anyway, or don't travel.

The data to fix this already exists. OpenStreetMap has street lamps tagged.
It has police stations, hospitals, pharmacies, bus stops. We checked — none of
it is used for routing.

And when something does go wrong, a hazard reported by one person stays with
the people she tells. There's no path from a citizen report to an officer."

Judge may ask: "How big is this problem? Do you have statistics?"
Answer: "We deliberately haven't put invented numbers on this slide. What we can
state factually is that OpenStreetMap tags street lighting, police, hospitals
and transit, and no mainstream routing product consumes those tags for safety.
That data gap is the technical opportunity."

Do NOT invent crime statistics or percentages.""")

# ══════════════════════════════════════════════════════════════════════
# SLIDE 3 — OUR SOLUTION
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "02 — Our solution", "Route safety as a first-class output")

flow = [
    ("SOURCE +\nDESTINATION", TEAL_PALE, TEAL_DK),
    ("THREE\nROUTES", PANEL2, INK),
    ("SAFETY\nANALYSIS", PANEL2, INK),
    ("SAFETY\nSCORE", TEAL, WHITE),
    ("USER\nCHOOSES", PANEL2, INK),
    ("SAFER\nJOURNEY", TEAL, WHITE),
]
bw, gap = 1.79, 0.22
x = M
for i, (t, fill, tc) in enumerate(flow):
    rect(s, x, 1.72, bw, 1.02, fill=fill, line=(None if fill in (TEAL,) else LINE))
    txt(s, x + 0.08, 1.96, bw - 0.16, 0.60, t, size=10.5, color=tc, bold=True,
        align=PP_ALIGN.CENTER, spacing=1.14, font=FS)
    if i < len(flow) - 1:
        arrow_r(s, x + bw + 0.03, 2.16, 0.16, TEAL)
    x += bw + gap

txt(s, M, 2.98, 6.0, 0.28, "THE ECOSYSTEM AROUND IT", size=10, color=MUTED, bold=True, font=FS)
eco = [
    ("Citizen Reports", "Category, area, details and a photo — stored against the hazard location.", PINK),
    ("Smart SOS", "Cancel window, live location, message to contacts, officer alert.", ROSE),
    ("Government Console", "Officer dashboard, case management, status workflow, action audit trail.", BLUE),
]
x = M
for t, b, c in eco:
    card(s, x, 3.30, 3.93, 1.34, t, b, accent=c, fill=PANEL, tsize=12, bsize=9.5)
    x += 4.16

# value strip
rect(s, M, 4.92, 12.10, 1.20, fill=SLATE_900, line=None)
txt(s, M + 0.34, 5.10, 3.0, 0.28, "THE CORE IDEA", size=9.5, color=TEAL, bold=True, font=FS)
txt(s, M + 0.34, 5.40, 11.4, 0.56,
    "We do not hide the slower route. We show that the longer option scores higher, and let her decide — "
    "because eight minutes versus six is her judgement, not ours.",
    size=12.5, color=WHITE, spacing=1.26)
footer(s, 3)
notes(s, """SAY:

"Here's the whole product in one line. You give us a source and a destination.
We return three routes. We analyse the environment along each one. We score
them. We show you the trade-off, and you choose.

The flow on screen is the actual sequence: geocode, route, analyse, score,
choose.

Around that sit three more pieces. Citizens can report a hazard with a photo —
that goes into a private storage bucket and the officer console sees it. SOS
alerts her contacts and our officers. And the console closes the loop with
status and an action trail."

Then land the point at the bottom: "The important design decision is that we
do NOT hide the slower route. If the 5.3 km option scores 61 and the 4.5 km
option scores 55, we show both. Silently substituting the safe route removes
her agency. We present the information and respect the choice."

Judge may ask: "Why three routes, not just the safest?"
Answer: "Because the safest route may be unacceptably long. Three gives a real
trade-off. The highest score is preselected and badged Safest, but every option
stays tappable.""")

# ══════════════════════════════════════════════════════════════════════
# SLIDE 4 — THE MOBILE APP
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "03 — The product", "The Safe-Her mobile app")

pw = 1.74
gapx = (12.10 - 5 * pw) / 4
labels = [
    ("Home", "Live Safety Index", TEAL),
    ("Smart Routing", "Source → Destination", BLUE),
    ("Safety Score", "Factor breakdown", GREEN),
    ("Report Hazard", "Category + photo", PINK),
    ("Emergency SOS", "Live location", ROSE),
]
x = M
for cap, sub, acc in labels:
    rect(s, x, 1.60, pw, 0.32, fill=acc, adj=0.32)
    txt(s, x, 1.67, pw, 0.22, cap, size=9.5, color=WHITE, bold=True,
        align=PP_ALIGN.CENTER, font=FS)
    phone(s, x, 2.02, pw, 0, sub, accent=acc)
    x += pw + gapx

# what to say strip
rect(s, M, 6.24, 12.10, 0.62, fill=PANEL, line=None)
feats = [
    ("Native Android", "EAS-built APK"),
    ("2 themes", "Light & midnight"),
    ("Offline queue", "Reports retry"),
    ("Role-aware", "Citizen / officer"),
]
x = M + 0.30
for t, b in feats:
    rect(s, x, 6.36, 0.05, 0.38, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
    txt(s, x + 0.16, 6.34, 2.6, 0.22, t, size=10, color=INK, bold=True, font=FS)
    txt(s, x + 0.16, 6.57, 2.6, 0.20, b, size=8, color=MUTED)
    x += 2.95
footer(s, 4)
notes(s, """SAY:

"This is the actual Safe-Her app on an Android device — a signed APK we built
in the cloud with Expo EAS Build.

Left to right: the home screen with the live safety index and a one-tap SOS;
the routing screen where you enter a source and destination; the route
comparison showing three options each with a score; hazard reporting with the
photo upload; and the active SOS screen showing live coordinates and duration.

Everything here is one React Native codebase — the same components render on
the officer's desktop console."

IMPORTANT — BEFORE PRESENTING:
Drop your real screenshots into the five phone frames on this slide. Recommended
capture size per phone: 1080 x 2340 (9:19.5). Crop to the status bar, keep the
bottom nav visible. If you capture from the web build, use a 430px-wide window
so the layout matches a real device.

Judge may ask: "Is this a real app or a prototype?"
Answer: "A working build. We produced a signed APK through EAS Build, installed
it on a physical Android device, and the flows you see are the real ones.""")

# ══════════════════════════════════════════════════════════════════════
# SLIDE 5 — HOW IT WORKS
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "04 — How it works", "From two place names to a safety score")

stages = [
    ("USER", "opens Safe-Her", TEAL),
    ("LOCATION", "GPS fix", TEAL),
    ("SOURCE &\nDESTINATION", "two places", TEAL),
    ("GEOCODING", "Nominatim", BLUE),
    ("ROUTE\nGENERATION", "OSRM", BLUE),
    ("SAFETY DATA", "Overpass +\nOpen-Meteo", GREEN),
    ("SAFETY\nENGINE", "8 weighted\nfactors", TEAL),
    ("ROUTE\nSCORE", "0 – 100", TEAL),
    ("USER\nDECISION", "picks a route", PINK),
]
bw = 1.24
gap = 0.14
x = M
for i, (t, b, c) in enumerate(stages):
    rect(s, x, 1.76, bw, 1.24, fill=WHITE, line=c, lw=1.5)
    rect(s, x, 1.76, bw, 0.055, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, x + 0.06, 1.96, bw - 0.12, 0.52, t, size=9.5, color=INK, bold=True,
        align=PP_ALIGN.CENTER, spacing=1.10, font=FS)
    txt(s, x + 0.06, 2.54, bw - 0.12, 0.40, b, size=7.5, color=MUTED,
        align=PP_ALIGN.CENTER, spacing=1.08)
    if i < len(stages) - 1:
        arrow_r(s, x + bw + 0.005, 2.30, 0.13, FAINT)
    x += bw + gap

# split at the engine
rect(s, M + 5 * (bw + gap) - 0.06, 1.62, 0.045, 1.52, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
txt(s, M + 5 * (bw + gap) - 0.10, 3.20, 1.9, 0.24, "THE ENGINE", size=8, color=TEAL,
    bold=True, font=FS, align=PP_ALIGN.CENTER)

# service cards
txt(s, M, 3.66, 6.0, 0.28, "EXTERNAL SERVICES — ALL OPEN DATA, NO API KEYS FOR SAFETY LOGIC",
    size=9.5, color=MUTED, bold=True, font=FS)
svcs = [
    ("Nominatim", "Place name → coordinates", BLUE),
    ("OSRM", "Route geometry, distance, turns", BLUE),
    ("Overpass API", "OpenStreetMap: lamps, police, hospitals, shops", GREEN),
    ("Open-Meteo", "Rain, visibility, wind, weather code", GREEN),
    ("Supabase", "Authentication, profiles, image storage", TEAL),
    ("FastAPI engine", "Scoring, reports, officer workflow", TEAL_DK),
]
bw2 = 1.93
for i, (t, b, c) in enumerate(svcs):
    col, row = i % 3, i // 3
    x = M + col * (bw2 + 0.16)
    y = 4.00 + row * 0.94
    rect(s, x, y, bw2, 0.82, fill=PANEL, line=None)
    rect(s, x, y, 0.05, 0.82, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, x + 0.16, y + 0.12, bw2 - 0.28, 0.24, t, size=10, color=INK, bold=True, font=FS)
    txt(s, x + 0.16, y + 0.36, bw2 - 0.28, 0.40, b, size=8, color=MUTED, spacing=1.14)

# two-phase note
rect(s, 7.14, 3.66, 5.58, 0.28, fill=TEAL_PALE, line=None)
txt(s, 7.32, 3.70, 5.3, 0.22, "Geometry returns in ~2s. Scores stream in per route behind it.",
    size=9.5, color=TEAL_DK, bold=True, font=FS)
footer(s, 5)
notes(s, """SAY:

"Follow it left to right. The user opens the app, we take a GPS fix, she types
a source and a destination. Those two place names go to Nominatim, which turns
them into coordinates.

OSRM gives us the actual road geometry — distance, duration, and the turn list
for each road segment.

Then we collect safety data. Overpass, which is our interface to
OpenStreetMap, tells us how many street lamps, police stations, hospitals,
pharmacies and bus stops are near each point along the route. Open-Meteo gives
us rain, visibility and wind.

Our FastAPI engine combines those into eight normalised factors, applies the
weights, and produces a score out of a hundred for each route.

Then the user decides."

The technical detail worth saying out loud: "We deliberately made this TWO
calls, not one. Geometry comes back in about two seconds so the map draws
immediately, and safety scores stream in per route behind it. That means a slow
OpenStreetMap query can never block the map, and if safety fails on one route
the other two still show."

Judge may ask: "What happens if Overpass is down?"
Answer: "We mark that factor as unknown rather than scoring it as zero, drop
the confidence, and the UI says 'Partial data — some live sources were
unavailable'. We'd rather show honest uncertainty than fake precision." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 6 — SYSTEM ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "05 — Architecture", "System architecture")

# user row
rect(s, 5.30, 1.56, 2.74, 0.50, fill=SLATE_900, line=None)
txt(s, 5.30, 1.68, 2.74, 0.26, "USERS  ·  CITIZEN + OFFICER", size=9.5, color=WHITE,
    bold=True, align=PP_ALIGN.CENTER, font=FS)
arrow_d(s, 6.58, 2.08, 0.20, FAINT)

# app
rect(s, 4.16, 2.30, 5.02, 0.56, fill=TEAL, line=None)
txt(s, 4.16, 2.42, 5.02, 0.28, "SAFE-HER  ·  React Native + Expo  (Android APK)", size=11,
    color=WHITE, bold=True, align=PP_ALIGN.CENTER, font=FS)
arrow_d(s, 6.58, 2.88, 0.20, FAINT)

# two backends
rect(s, 1.10, 3.28, 4.60, 0.60, fill=WHITE, line=TEAL, lw=1.75)
txt(s, 1.10, 3.36, 4.60, 0.24, "SUPABASE", size=10.5, color=TEAL_DK, bold=True,
    align=PP_ALIGN.CENTER, font=FS)
txt(s, 1.10, 3.60, 4.60, 0.22, "Auth · Postgres profiles (RLS) · Storage", size=8.5,
    color=MUTED, align=PP_ALIGN.CENTER)

rect(s, 6.28, 3.28, 6.10, 0.60, fill=WHITE, line=BLUE, lw=1.75)
txt(s, 6.28, 3.36, 6.10, 0.24, "FASTAPI SAFETY ENGINE", size=10.5, color=BLUE, bold=True,
    align=PP_ALIGN.CENTER, font=FS)
txt(s, 6.28, 3.60, 6.10, 0.22, "Python · asyncio · /safety · /reports · /government", size=8.5,
    color=MUTED, align=PP_ALIGN.CENTER)

# connector
rect(s, 5.62, 3.50, 0.62, 0.045, fill=FAINT, shape=MSO_SHAPE.RECTANGLE)

# stores
rect(s, 1.10, 4.14, 4.60, 0.52, fill=PANEL, line=None)
txt(s, 1.28, 4.24, 4.3, 0.30, "profiles table  ·  private report-images bucket",
    size=9, color=INK_SOFT)
rect(s, 6.28, 4.14, 6.10, 0.52, fill=PANEL, line=None)
txt(s, 6.46, 4.24, 5.8, 0.30, "SQLite: reports · report_actions · sos_alerts · journeys",
    size=9, color=INK_SOFT)

arrow_d(s, 9.20, 3.90, 0.20, BLUE)

# external services
txt(s, 6.28, 4.86, 6.10, 0.24, "EXTERNAL GEOSPATIAL + WEATHER SERVICES", size=8.5,
    color=MUTED, bold=True, font=FS)
ext = [("OSRM", "routing"), ("Overpass", "OSM data"), ("Open-Meteo", "weather"),
       ("Nominatim", "geocoding"), ("MapTiler", "tiles")]
bw3 = 1.16
for i, (t, b) in enumerate(ext):
    x = 6.28 + i * (bw3 + 0.10)
    rect(s, x, 5.16, bw3, 0.66, fill=WHITE, line=LINE)
    txt(s, x + 0.04, 5.26, bw3 - 0.08, 0.22, t, size=9, color=INK, bold=True,
        align=PP_ALIGN.CENTER, font=FS)
    txt(s, x + 0.04, 5.48, bw3 - 0.08, 0.20, b, size=7.5, color=MUTED, align=PP_ALIGN.CENTER)

# data flow back
rect(s, 6.28, 6.06, 6.10, 0.44, fill=TEAL_PALE, line=None)
txt(s, 6.44, 6.16, 5.8, 0.24, "Scored routes → app UI  ·  citizen report → officer console",
    size=9.5, color=TEAL_DK, bold=True, font=FS)

# side notes
txt(s, 1.10, 4.86, 4.60, 0.24, "WHY TWO DATA STORES", size=8.5, color=MUTED, bold=True, font=FS)
txt(s, 1.10, 5.12, 4.60, 0.92,
    "Identity and image bytes live in Supabase, protected by Row Level Security.\n"
    "Operational records live in SQLite on the engine host, where the officer\n"
    "workflow is transactional and the dataset is small.",
    size=9, color=INK_SOFT, spacing=1.30)
footer(s, 6)
notes(s, """SAY:

"Three tiers, and the split is deliberate.

The React Native app owns presentation and device capability — GPS, the SMS
composer, background location.

Supabase owns identity and image bytes. One profiles table with Row Level
Security so a user can only ever read their own row, and one private storage
bucket for report photos.

The FastAPI engine owns all geospatial computation, so the heavy logic is
testable in isolation from the UI. It also owns the operational records —
reports, officer actions, SOS alerts — in SQLite, because that's a
transactional workflow over a small dataset.

Underneath, five external services, all open data: OSRM for routing, Overpass
for OpenStreetMap infrastructure, Open-Meteo for weather, Nominatim for
geocoding, MapTiler for the map tiles."

If asked why two stores: "Different lifecycles and different access patterns.
It's prototype-grade — in production these converge onto one database. Moving
it is a migration, not a redesign."

Judge may ask: "Is the backend authenticated?"
Answer honestly: "Not yet. Every engine endpoint is currently open to anyone who
can reach the port. We've narrowed it — parameterised SQL, input validation,
a CORS allow-list instead of a wildcard — but JWT validation in the engine is
the first item on our roadmap." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 7 — SMART ROUTING
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "06 — Smart routing", "Multiple routes, generated not requested")

# left flow
fx = M
node(s, fx + 1.02, 1.62, 1.50, 0.48, "SOURCE", None, fill=SLATE_900, line=None, tcol=WHITE)
arrow_d(s, fx + 1.70, 2.12, 0.20)
node(s, fx + 1.02, 2.34, 1.50, 0.48, "DESTINATION", None, fill=SLATE_900, line=None, tcol=WHITE)
arrow_d(s, fx + 1.70, 2.84, 0.20)
rect(s, fx, 3.06, 3.54, 0.54, fill=TEAL, line=None)
txt(s, fx, 3.18, 3.54, 0.28, "ROUTE ENGINE", size=11, color=WHITE, bold=True,
    align=PP_ALIGN.CENTER, font=FS)
arrow_d(s, fx + 1.70, 3.62, 0.20)

routes = [("Route A", "4.5 km · 6 min", 55, "ELEVATED", AMBER, False),
          ("Route B", "5.3 km · 8 min", 61, "Safest", TEAL, True),
          ("Route C", "5.4 km · 9 min", 53, "ELEVATED", ROSE, False)]
ry = 3.86
for name, meta, score, band, c, best in routes:
    rect(s, fx, ry, 3.54, 0.62, fill=(TEAL_PALE if best else PANEL), line=(TEAL if best else None), lw=1.5)
    rect(s, fx, ry, 0.055, 0.62, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, fx + 0.18, ry + 0.10, 1.0, 0.24, name, size=10.5, color=INK, bold=True, font=FS)
    txt(s, fx + 0.18, ry + 0.32, 1.7, 0.22, meta, size=8.5, color=MUTED)
    txt(s, fx + 2.10, ry + 0.10, 1.30, 0.26, f"{score}", size=13, color=c, bold=True,
        align=PP_ALIGN.RIGHT, font=FS)
    txt(s, fx + 2.10, ry + 0.36, 1.30, 0.20, band, size=7.5, color=MUTED, align=PP_ALIGN.RIGHT)
    ry += 0.68
txt(s, fx, ry + 0.02, 3.54, 0.22, "Illustrative values — not a live capture", size=7.5,
    color=FAINT, italic=True)

# right: three points
txt(s, 4.46, 1.62, 4.0, 0.28, "HOW IT ACTUALLY WORKS", size=10, color=TEAL, bold=True, font=FS)
pts = [
    ("We generate the alternatives",
     "Public OSRM accepts alternatives=true but silently returns one route. We verified that on two hosts, so we push an intermediate waypoint off the direct line and ask again."),
    ("We guarantee they're genuinely different",
     "A symmetric Jaccard similarity test on the geometry rejects any candidate more than 0.80 similar to a route we already kept. Otherwise a near-duplicate gets presented as a real choice."),
    ("We present the trade-off, we don't decide it",
     "Each card shows distance, duration and score side by side. The safest is preselected and badged, but every route stays tappable."),
]
py = 1.96
for i, (t, b) in enumerate(pts):
    rect(s, 4.46, py, 0.30, 0.30, fill=TEAL, adj=0.5)
    txt(s, 4.46, py + 0.055, 0.30, 0.20, str(i + 1), size=9.5, color=WHITE, bold=True,
        align=PP_ALIGN.CENTER, font=FS)
    txt(s, 4.90, py + 0.01, 3.42, 0.26, t, size=11.5, color=INK, bold=True, font=FS)
    txt(s, 4.90, py + 0.30, 3.42, 0.86, b, size=9.5, color=MUTED, spacing=1.26)
    py += 1.24

# right stat strip
rect(s, 8.52, 1.62, 4.20, 2.36, fill=SLATE_900, line=None)
txt(s, 8.80, 1.82, 3.7, 0.26, "WHY THIS IS THE INTERESTING PART", size=9, color=TEAL,
    bold=True, font=FS)
txt(s, 8.80, 2.16, 3.66, 1.66,
    "Most teams would call the routing API three times and ship whatever came "
    "back — often the same road labelled differently.\n\n"
    "We had to solve a problem the public API refused to solve.",
    size=10, color=WHITE, spacing=1.32)

# road-type factor
rect(s, 8.52, 4.16, 4.20, 2.36, fill=PANEL, line=None)
txt(s, 8.80, 4.36, 3.7, 0.26, "WHAT MAKES EACH ROUTE SCORE DIFFERENTLY", size=9,
    color=TEAL, bold=True, font=FS)
diffs = [("Segment sampling", "Each route is cut into 5 points, so each queries its own surroundings."),
         ("Turn density", "Feeder roads into a station score worse than a straight arterial."),
         ("Road class", "The same destination via a primary road and a service lane diverges.")]
dy = 4.70
for t, b in diffs:
    rect(s, 8.80, dy + 0.05, 0.045, 0.44, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
    txt(s, 8.96, dy, 3.5, 0.22, t, size=10, color=INK, bold=True, font=FS)
    txt(s, 8.96, dy + 0.22, 3.5, 0.40, b, size=8.5, color=MUTED, spacing=1.16)
    dy += 0.62
footer(s, 7)
notes(s, """SAY:

"Three routes, and here's the engineering story behind them.

We wanted to request three alternatives. We couldn't. The public OSRM server
accepts the alternatives parameter and silently returns a single route — we
verified that against two separate hosts. So we generate them: we push an
intermediate waypoint perpendicular to the direct line, in a local
equirectangular projection so the offset is a true distance in metres, and ask
again.

Then we had to prove they're different. A Jaccard similarity test on the
geometry rejects anything more than 0.80 similar to a route we already kept.
That guard matters: without it an 85%-identical duplicate got presented to a
user as a genuine alternative.

On the right: why does each route score differently? Because we cut each route
into five segments and query the surroundings of each one. Two routes to the
same place pass different streets, hit different lamps, and have different turn
densities.

And the last point is the product decision — we preselect the safest but never
remove the others."

DO NOT say "Safe-Her finds the best route." It offers options.

Judge may ask: "How is the 0.80 threshold chosen?"
Answer: "Empirically, by inspecting the overlap distribution the Jaccard test
produced for real Chennai routes. Anything above roughly that was visually the
same road. It's a tuning parameter, not a derived constant." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 8 — SAFETY SCORE
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "07 — The core", "How the safety score is calculated")

# factors grid
txt(s, M, 1.56, 6.0, 0.26, "EIGHT FACTORS — ALL MEASURED FROM REAL MAP DATA",
    size=9.5, color=MUTED, bold=True, font=FS)
facs = [
    ("Lighting", 0.20, "Street-lamp density\nOverpass · 500 m", TEAL),
    ("Road type", 0.15, "Road class from OSRM\nstep names", BLUE),
    ("Police", 0.15, "Police nodes within\n1 km", BLUE),
    ("Hospital", 0.10, "Hospital 2 km /\nclinic 1.5 km", BLUE),
    ("Amenities", 0.10, "Shops, restaurants,\npharmacies, transit", GREEN),
    ("Weather", 0.10, "Rain, visibility, wind\nOpen-Meteo", GREEN),
    ("Time", 0.10, "Local solar hour\n+ weekend", AMBER),
    ("Route shape", 0.10, "Turns per km\nOSRM steps", AMBER),
]
bw4, bh = 1.46, 1.10
for i, (t, wv, b, c) in enumerate(facs):
    col, row = i % 4, i // 4
    x = M + col * (bw4 + 0.14)
    y = 1.88 + row * (bh + 0.16)
    rect(s, x, y, bw4, bh, fill=PANEL, line=None)
    rect(s, x, y, bw4, 0.05, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, x + 0.12, y + 0.14, bw4 - 0.24, 0.24, t, size=10.5, color=INK, bold=True, font=FS)
    txt(s, x + 0.12, y + 0.38, bw4 - 0.24, 0.44, b, size=7.5, color=MUTED, spacing=1.14)
    # weight bar
    rect(s, x + 0.12, y + 0.88, bw4 - 0.24, 0.10, fill=RGBColor(0xE2, 0xE8, 0xF0), shape=MSO_SHAPE.RECTANGLE)
    rect(s, x + 0.12, y + 0.88, (bw4 - 0.24) * (wv / 0.20), 0.10, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, x + 0.12, y + 0.96, bw4 - 0.24, 0.18, f"weight {wv:.2f}", size=6.5, color=FAINT)

# pipeline
txt(s, M, 4.42, 6.0, 0.26, "RAW DATA → NORMALISE → WEIGHT → SCORE", size=9.5,
    color=MUTED, bold=True, font=FS)
pipe = [("RAW", "lamp count,\nrain, turns…", PANEL2),
        ("NORMALISE", "each → 0.00–1.00\nby fixed thresholds", PANEL2),
        ("WEIGHT", "× published\nweights", PANEL2),
        ("0–100", "length-weighted\nroute score", TEAL)]
px = M
for i, (t, b, f) in enumerate(pipe):
    rect(s, px, 4.74, 1.42, 0.86, fill=f, line=(None if f == TEAL else LINE))
    txt(s, px + 0.06, 4.88, 1.30, 0.24, t, size=10, color=(WHITE if f == TEAL else INK),
        bold=True, align=PP_ALIGN.CENTER, font=FS)
    txt(s, px + 0.06, 5.12, 1.30, 0.40, b, size=7.5,
        color=(TEAL_PALE if f == TEAL else MUTED), align=PP_ALIGN.CENTER, spacing=1.10)
    if i < 3:
        arrow_r(s, px + 1.45, 5.10, 0.16, FAINT)
    px += 1.60

# formula box
rect(s, M, 5.82, 6.30, 0.86, fill=SLATE_900, line=None)
txt(s, M + 0.22, 5.94, 5.9, 0.24, "SAFETY SCORE  =  100 ×", size=9, color=TEAL, bold=True, font=FS)
txt(s, M + 0.22, 6.20, 5.9, 0.40,
    "0.20·L  +  0.15·R  +  0.15·P  +  0.10·H  +  0.10·A  +  0.10·W  +  0.10·T  +  0.10·D",
    size=11, color=WHITE, bold=True, font=FM)

# right: bands + honesty
txt(s, 6.92, 1.56, 6.0, 0.26, "RISK BANDS", size=9.5, color=MUTED, bold=True, font=FS)
bands = [("80 – 100", "LOW", GREEN), ("60 – 79", "MODERATE", AMBER),
         ("40 – 59", "ELEVATED", ROSE), ("0 – 39", "HIGH", RGBColor(0xB9, 0x1C, 0x1C))]
by = 1.88
for rng, lbl, c in bands:
    rect(s, 6.92, by, 2.32, 0.42, fill=c, adj=0.22)
    txt(s, 7.04, by + 0.09, 1.0, 0.24, rng, size=10, color=WHITE, bold=True, font=FS)
    txt(s, 8.06, by + 0.09, 1.1, 0.24, lbl, size=10, color=WHITE, bold=True,
        align=PP_ALIGN.RIGHT, font=FS)
    by += 0.50

# honesty panel
rect(s, 6.92, 3.94, 5.80, 2.74, fill=PANEL, line=None)
txt(s, 7.20, 4.14, 5.3, 0.26, "TWO THINGS WE DID ON PURPOSE", size=9.5, color=TEAL,
    bold=True, font=FS)
h1 = rect(s, 7.20, 4.48, 5.24, 0.96, fill=WHITE, line=None)
rect(s, 7.20, 4.48, 0.05, 0.96, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
txt(s, 7.38, 4.58, 4.9, 0.24, "Distance is NOT penalised", size=10.5, color=INK, bold=True, font=FS)
txt(s, 7.38, 4.84, 4.9, 0.54,
    "Penalising distance would push women onto motorways — exactly the behaviour this product exists to prevent.",
    size=9, color=MUTED, spacing=1.20)

rect(s, 7.20, 5.56, 5.24, 0.96, fill=WHITE, line=None)
rect(s, 7.20, 5.56, 0.05, 0.96, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
txt(s, 7.38, 5.66, 4.9, 0.24, "Missing data ≠ good data", size=10.5, color=INK, bold=True, font=FS)
txt(s, 7.38, 5.92, 4.9, 0.54,
    "A failed Overpass query pins that factor to a neutral 0.60 and drops confidence — it never scores as perfect.",
    size=9, color=MUTED, spacing=1.20)
footer(s, 8)
notes(s, """THIS IS THE MOST IMPORTANT SLIDE. SAY:

"Safety isn't one thing, so we decomposed it into eight factors we can actually
measure, and weighted them.

Lighting is the heaviest at 0.20, because an unlit road is the single biggest
predictor of how exposed someone feels — that's the product thesis. Road type
and police proximity are 0.15 each. Hospital, amenities, weather, time of day
and route shape are 0.10 each. The weights sum to exactly one.

Each factor is normalised to zero-to-one by fixed, documented thresholds, then
multiplied by its weight. The segment score is that sum times a hundred, and
the route score is the length-weighted mean across segments — so 900 metres of
well-lit road genuinely outweighs 490 metres of dark lane.

The score maps to four bands: 80 and above is LOW risk, 60 is MODERATE, 40 is
ELEVATED, below that is HIGH."

Then the two deliberate decisions — say these with conviction:

"One: we do NOT penalise distance. If we did, the optimiser would push women
onto motorways, which is exactly the behaviour this product exists to prevent.

Two: when a data source fails, we do not score that factor as zero — we pin it
to a neutral 0.60 and drop the confidence, and the UI says 'Partial data'. We
would rather show honest uncertainty than fake precision."

BE READY FOR: "Is this machine learning?"
Answer: "No. It's a deterministic weighted model — you can verify the arithmetic
on a whiteboard. With no labelled incident data for Chennai, a trained model
would be fiction. This one is auditable, and that's the point."

Also: "Where did the weights come from?"
Answer: "Product judgement, and we label it as such. Calibrating them against
real incident data is the first research step we'd take next." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 9 — SOS
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "08 — Emergency", "SOS — emergency support")

# flow
f1 = [("USER", "taps SOS", ROSE), ("CANCEL\nWINDOW", "3 seconds to abort", ROSE),
      ("LOCATION", "GPS fix", PINK), ("ALERT", "contacts + officers", PINK),
      ("TRACKING", "live position", PINK)]
bx = M
for i, (t, b, c) in enumerate(f1):
    rect(s, bx, 1.66, 2.10, 0.86, fill=WHITE, line=c, lw=1.5)
    rect(s, bx, 1.66, 2.10, 0.05, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, bx + 0.08, 1.84, 1.94, 0.32, t, size=10.5, color=INK, bold=True,
        align=PP_ALIGN.CENTER, spacing=1.08, font=FS)
    txt(s, bx + 0.08, 2.22, 1.94, 0.22, b, size=8, color=MUTED, align=PP_ALIGN.CENTER)
    if i < 4:
        arrow_r(s, bx + 2.13, 2.02, 0.16, ROSE)
    bx += 2.42

# three legs
txt(s, M, 2.86, 6.0, 0.26, "THREE INDEPENDENT ALERTING LEGS", size=9.5, color=MUTED,
    bold=True, font=FS)
legs = [
    ("Alert her contacts", "Builds a message with coordinates, a Google Maps link and a timestamp, then opens the SMS composer with every emergency contact pre-filled.", GREEN),
    ("Alert the officers", "Pushes the alert to the government console with coordinates, accuracy and contact count.", BLUE),
    ("Keep tracking", "Starts background location updates so the active screen shows a live position for the whole session.", TEAL),
]
lx = M
for t, b, c in legs:
    card(s, lx, 3.16, 3.93, 1.42, t, b, accent=c, fill=PANEL, tsize=11.5, bsize=9)
    lx += 4.16

# implemented vs planned
rect(s, M, 4.82, 6.30, 1.86, fill=RGBColor(0xEC, 0xFD, 0xF5), line=None)
txt(s, M + 0.26, 4.98, 5.8, 0.26, "✓  IMPLEMENTED TODAY", size=10, color=GREEN,
    bold=True, font=FS)
imp = ["3-second cancel window before anything sends",
       "SMS composer and share sheet with a Maps link",
       "Officer console alert via the backend",
       "Background location tracking in a built APK"]
iy = 5.30
for t in imp:
    rect(s, M + 0.30, iy + 0.045, 0.09, 0.09, fill=GREEN, adj=0.5)
    txt(s, M + 0.50, iy, 5.7, 0.24, t, size=9, color=INK_SOFT)
    iy += 0.30

rect(s, 7.42, 4.82, 5.30, 1.86, fill=RGBColor(0xFF, 0xFB, 0xEB), line=None)
txt(s, 7.68, 4.98, 4.8, 0.26, "○  NOT IMPLEMENTED — AND WE SAY SO", size=10,
    color=AMBER, bold=True, font=FS)
nimp = ["No automatic 112 / 911 dispatch — no telephony integration",
        "No silent SMS: the OS requires the user to press send",
        "No two-way officer ↔ responder channel during an SOS",
        "No automated emergency-service notification"]
ny = 5.30
for t in nimp:
    rect(s, 7.72, ny + 0.045, 0.09, 0.09, fill=AMBER, adj=0.5)
    txt(s, 7.92, ny, 4.6, 0.24, t, size=9, color=INK_SOFT)
    ny += 0.30
footer(s, 9)
notes(s, """SAY — AND LEAD WITH THE DESIGN DECISION:

"The first thing we built into SOS was a three-second cancel window. The worst
outcome for a panic feature isn't a failure — it's a false alarm sent to
someone's family at two in the morning. So the user has three seconds to abort.

After that it grabs GPS, then runs three independent legs. It builds a message
with the coordinates, a Google Maps link and a timestamp, and opens the SMS
composer with every emergency contact pre-filled. It pushes an alert to our
officer console. And it starts background location tracking so she can see, and
we can see, exactly where she is."

Then be direct about the boundary — say this proudly, don't apologise:

"Now, what SOS does not do, and we want to be clear about it. It does not call
112 automatically — we have no telephony integration. And it does not send SMS
silently, because the operating system does not permit that; it opens the
composer and the user presses send. That's a platform constraint, and we work
with it rather than pretending otherwise. What we do is get the information to
her contacts and to our officers in seconds. Dispatch stays a human decision."

Judge may ask: "Why can't you send the SMS automatically?"
Answer: "The OS restricts it deliberately — auto-sending SMS is a known abuse
vector. expo-sms pre-fills everything so the user taps once. Bypassing that
would mean holding the send button, which is a worse product."

Judge may ask: "Does it work without internet?"
Answer: "Everything that matters most works offline — the countdown, GPS, the
message, the composer, and background tracking. Only the officer alert needs
the network, and it's best-effort by design so a dead connection can never delay
local help." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 10 — CITIZEN REPORT → GOVERNMENT
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "09 — The feedback loop", "From citizen report to action")

# left column
rect(s, M, 1.62, 5.42, 4.20, fill=PANEL, line=None)
txt(s, M + 0.28, 1.82, 4.8, 0.28, "CITIZEN APP", size=10, color=PINK, bold=True, font=FS)
lsteps = [("Report a hazard", "7 categories: poor lighting, harassment, theft, CCTV, unsafe stop…"),
          ("Add the location", "GPS attached automatically; area name as fallback"),
          ("Describe it", "Free-text details, all optional"),
          ("Attach a photo", "Checked against the 4 MB bucket limit, then uploaded to private storage"),
          ("Submit", "The report and its image path are stored together")]
ly = 2.20
for i, (t, b) in enumerate(lsteps):
    rect(s, M + 0.28, ly, 0.28, 0.28, fill=PINK, adj=0.5)
    txt(s, M + 0.28, ly + 0.045, 0.28, 0.20, str(i + 1), size=9, color=WHITE, bold=True,
        align=PP_ALIGN.CENTER, font=FS)
    txt(s, M + 0.68, ly + 0.01, 4.5, 0.24, t, size=11, color=INK, bold=True, font=FS)
    txt(s, M + 0.68, ly + 0.25, 4.5, 0.32, b, size=8.5, color=MUTED, spacing=1.14)
    if i < 4:
        rect(s, M + 0.415, ly + 0.30, 0.022, 0.20, fill=RGBColor(0xF9, 0xA8, 0xD4), shape=MSO_SHAPE.RECTANGLE)
    ly += 0.72

# centre connection
rect(s, 6.30, 3.40, 0.72, 0.72, fill=SLATE_900, adj=0.22)
txt(s, 6.30, 3.52, 0.72, 0.24, "DB", size=11, color=TEAL, bold=True,
    align=PP_ALIGN.CENTER, font=FS)
txt(s, 6.30, 3.74, 0.72, 0.20, "engine", size=6.5, color=FAINT, align=PP_ALIGN.CENTER)
arrow_r(s, 5.86, 3.68, 0.42, PINK)
arrow_r(s, 7.06, 3.68, 0.42, BLUE)
txt(s, 6.10, 4.20, 1.12, 0.40, "SQLite\nreports", size=7.5, color=MUTED,
    align=PP_ALIGN.CENTER, spacing=1.10)

# right column
rect(s, 7.24, 1.62, 5.48, 4.20, fill=PANEL, line=None)
txt(s, 7.52, 1.82, 4.9, 0.28, "GOVERNMENT CONSOLE", size=10, color=BLUE, bold=True, font=FS)
rsteps = [("Receive the report", "Appears in the officer dashboard and pending queue immediately"),
          ("Review", "Full detail, map location, category, and the uploaded evidence"),
          ("Set status & priority", "New, under review, action taken, resolved, closed"),
          ("Take action", "Assign to an officer or department; record resolution notes"),
          ("Close with an audit trail", "Every action is appended — who, when, what changed")]
ry = 2.20
for i, (t, b) in enumerate(rsteps):
    rect(s, 7.52, ry, 0.28, 0.28, fill=BLUE, adj=0.5)
    txt(s, 7.52, ry + 0.045, 0.28, 0.20, str(i + 1), size=9, color=WHITE, bold=True,
        align=PP_ALIGN.CENTER, font=FS)
    txt(s, 7.92, ry + 0.01, 4.6, 0.24, t, size=11, color=INK, bold=True, font=FS)
    txt(s, 7.92, ry + 0.25, 4.6, 0.32, b, size=8.5, color=MUTED, spacing=1.14)
    if i < 4:
        rect(s, 7.655, ry + 0.30, 0.022, 0.20, fill=RGBColor(0xBF, 0xDB, 0xFE), shape=MSO_SHAPE.RECTANGLE)
    ry += 0.72

# honesty strip
rect(s, M, 6.02, 12.10, 0.80, fill=SLATE_900, line=None)
txt(s, M + 0.30, 6.14, 11.6, 0.24, "THE LOOP, AND WHERE IT STOPS TODAY", size=9, color=TEAL,
    bold=True, font=FS)
txt(s, M + 0.30, 6.40, 11.6, 0.28,
    "Connected:  report → officer → status → action → closed, with a full audit trail.        "
    "Not yet:  the citizen cannot see the outcome of her own report.",
    size=10, color=WHITE)
footer(s, 10)
notes(s, """SAY:

"This is the feedback loop, and it runs on one shared record.

The citizen picks one of seven hazard categories, we attach her GPS
automatically so the officer gets a real location, she can add details, and
she can attach a photo. That photo is validated against the 4 MB bucket limit
and uploaded to private storage — we never make the bucket public.

The report lands in the engine, and it appears in the officer dashboard
immediately. The officer reviews the full detail and the map, sets a status and
priority, assigns it to themselves or a department, records resolution notes,
and closes it.

Every single action is appended to an audit trail — who did it, when, and what
the status was before and after. That matters for an accountability workflow."

Then the honest part, which will earn you credibility:

"The loop currently runs one way. The officer sees the outcome; the citizen
doesn't. A woman who reported a harassment at a stop can't see that an officer
closed it. That's the single most valuable thing we'd add next, because it turns
a one-way report into a closed loop."

Judge may ask: "How do you prevent an officer closing a report without acting?"
Answer: "Every action is written to a separate report_actions table with the
previous and next status, the officer and the department. Nothing is overwritten
— it's an append-only audit trail."

Judge may ask: "Are reports anonymous?"
Answer: "Yes. No name, email or user ID is stored on a report row, and the
image path is random so evidence can't be tied back to an account." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 11 — TECHNOLOGY & VALUE
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "10 — Stack & value", "Technology and real-world value")

# left: technology
txt(s, M, 1.58, 5.0, 0.28, "TECHNOLOGY — ALL OF IT SHIPPING", size=9.5, color=MUTED,
    bold=True, font=FS)
tech = [("React Native", "0.86 — the app"), ("Expo", "~57 — build & device APIs"),
        ("Expo Router", "file-based routing"), ("FastAPI", "Python async engine"),
        ("Python", "httpx, asyncio"), ("Supabase", "Auth · Postgres · Storage"),
        ("PostgreSQL", "profiles table, RLS"), ("SQLite", "operational records"),
        ("OSRM", "route geometry"), ("Overpass", "OpenStreetMap data"),
        ("Open-Meteo", "weather"), ("Nominatim", "geocoding"),
        ("MapTiler", "map tiles"), ("Leaflet", "map canvas"),
        ("EAS Build", "cloud APK build")]
for i, (t, b) in enumerate(tech):
    col, row = i % 3, i // 3
    x = M + col * 1.98
    y = 1.92 + row * 0.78
    rect(s, x, y, 1.86, 0.68, fill=PANEL, line=None)
    rect(s, x, y, 0.045, 0.68, fill=TEAL, shape=MSO_SHAPE.RECTANGLE)
    txt(s, x + 0.14, y + 0.10, 1.64, 0.24, t, size=9.5, color=INK, bold=True, font=FS)
    txt(s, x + 0.14, y + 0.33, 1.64, 0.30, b, size=7.5, color=MUTED, spacing=1.10)

# right: value
txt(s, 6.92, 1.58, 5.0, 0.28, "REAL-WORLD VALUE", size=9.5, color=MUTED, bold=True, font=FS)
vals = [
    ("Safer route awareness", "A route-level safety score turns an invisible risk into a number she can act on.", TEAL),
    ("Location-based safety information", "Lighting, emergency services and amenities along the actual road, not the straight line.", BLUE),
    ("Faster hazard reporting", "A structured report with GPS and a photo, filed in seconds rather than described later.", PINK),
    ("Emergency assistance", "Contacts alerted with a live map link, plus a 3-second window to prevent false alarms.", ROSE),
    ("Government visibility", "Officers see the same record, with a full action audit trail.", BLUE),
    ("Data for planning", "Aggregated reports become evidence for where lighting and patrols are actually needed.", GREEN),
]
vy = 1.92
for t, b, c in vals:
    rect(s, 6.92, vy, 5.80, 0.74, fill=WHITE, line=LINE)
    rect(s, 6.92, vy, 0.045, 0.74, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, 7.10, vy + 0.09, 5.4, 0.24, t, size=11, color=INK, bold=True, font=FS)
    txt(s, 7.10, vy + 0.33, 5.4, 0.34, b, size=8.5, color=MUTED, spacing=1.14)
    vy += 0.82
footer(s, 11)
notes(s, """SAY:

"On the left is the stack, and the point worth making is that the safety
intelligence depends on no paid API. OSRM, Overpass, OpenStreetMap, Open-Meteo
and Nominatim are all free and keyless. MapTiler is the only keyed service and
it's only the map imagery — it contributes nothing to the score. That means the
cost of running the safety engine for a user is effectively zero.

React Native and Expo for the app, FastAPI and Python for the engine, Supabase
for identity and image storage, SQLite for the operational records, and EAS
Build to produce a signed Android APK without a local Android toolchain.

On the right is the value. The core one is the first: we turn an invisible risk
into a number she can act on. Everything else — the reports, the SOS, the
officer console — exists so that number stays honest and improves over time.

And the last one is the long game: aggregated citizen reports become evidence
for where a city should put lighting and patrols. That's how this becomes
infrastructure, not just an app."

Judge may ask: "What's your running cost?"
Answer: "For the safety scoring, effectively zero — all keyless open APIs. The
real cost at scale is a self-hosted Overpass instance, because the public
mirrors rate-limit."

Do NOT use invented numbers of users, downloads or crime reduction.""")

# ══════════════════════════════════════════════════════════════════════
# SLIDE 12 — WHY DIFFERENT
# ══════════════════════════════════════════════════════════════════════
s = slide()
header(s, "11 — Differentiation", "Why Safe-Her is different")

# comparison table
rows = [
    ("What it optimises for", "Distance and time", "Distance, time AND safety"),
    ("How many options", "One route", "Three routes, each scored"),
    ("Street-level safety data", "Not used", "8 factors from OpenStreetMap + weather"),
    ("Transparent reasoning", "No explanation", "Every factor shown, with weights"),
    ("Treats the longer route", "Never offered", "Shown and badged, user decides"),
    ("Missing data", "Not applicable", "Marked unknown, never scored as safe"),
    ("Community reporting", "Not connected", "Report + photo → officer console"),
    ("Emergency support", "Third-party or none", "Built in, with a 3-second cancel"),
    ("Officer feedback loop", "None", "Status workflow with audit trail"),
]
c1, c2, c3 = M, 4.30, 8.56
w1, w2, w3 = 3.52, 4.10, 4.16

# header row
rect(s, c1, 1.58, w1, 0.46, fill=PANEL2, line=None)
rect(s, c2, 1.58, w2, 0.46, fill=PANEL2, line=None)
rect(s, c3, 1.58, w3, 0.46, fill=TEAL, line=None)
txt(s, c1 + 0.16, 1.68, w1 - 0.3, 0.26, "DECISION POINT", size=9, color=MUTED, bold=True, font=FS)
txt(s, c2 + 0.16, 1.68, w2 - 0.3, 0.26, "TRADITIONAL NAVIGATION", size=9, color=MUTED, bold=True, font=FS)
txt(s, c3 + 0.16, 1.68, w3 - 0.3, 0.26, "SAFE-HER", size=9, color=WHITE, bold=True, font=FS)

ry = 2.10
for i, (a, b, cc) in enumerate(rows):
    h = 0.44
    if i % 2 == 0:
        rect(s, c1, ry, w1, h, fill=PANEL, line=None)
        rect(s, c2, ry, w2, h, fill=PANEL, line=None)
    rect(s, c3, ry, w3, h, fill=RGBColor(0xF0, 0xFD, 0xFA), line=None)
    txt(s, c1 + 0.16, ry + 0.11, w1 - 0.3, 0.26, a, size=9.5, color=INK, bold=True)
    txt(s, c2 + 0.16, ry + 0.11, w2 - 0.3, 0.26, b, size=9.5, color=MUTED)
    txt(s, c3 + 0.16, ry + 0.11, w3 - 0.3, 0.26, cc, size=9.5, color=TEAL_DK, bold=True, font=FS)
    ry += h

# honest note
rect(s, M, 6.16, 12.10, 0.62, fill=PANEL, line=None)
txt(s, M + 0.26, 6.28, 11.6, 0.40,
    "We are not claiming to be better at navigation. We are adding one dimension that traditional navigation does not model at all — and refusing to hide its cost.",
    size=10, color=INK_SOFT, italic=True)
footer(s, 12)
notes(s, """SAY:

"I want to be precise here, because I don't think we're better at navigation.

We are not faster, we are not better at traffic, and we are not replacing
anything. What we do is add one dimension that traditional navigation does not
model at all — street-level safety — and then refuse to hide what that costs.

Look at row five. A traditional app will never offer you the slower route,
because it thinks it knows better than you. We show it, score it, badge it, and
let you decide. That's the difference — informed consent rather than silent
optimisation.

Row six is the one I'm proudest of. Every navigation app shows a confident
answer even when its data is wrong. When a data source fails, we tell you the
score is partial, rather than quietly showing a number we don't stand behind."

Judge may ask: "Isn't this just extra friction?"
Answer: "It's one extra tap, and it happens at planning time rather than in an
emergency. The alternative is a woman guessing whether a road is safe, which is
strictly worse."

Judge may ask: "How do you know women want this?"
Answer honestly: "That's the right question and the honest answer is we haven't
run a user study. What we can say is that the product removes an information
gap using data that already exists, and the safety score is fully inspectable
so users can judge it themselves." """)

# ══════════════════════════════════════════════════════════════════════
# SLIDE 13 — ROAD AHEAD + CLOSE
# ══════════════════════════════════════════════════════════════════════
s = slide(dark=True)
rect(s, -1.4, 3.6, 5.6, 5.6, fill=RGBColor(0x0C, 0x1F, 0x33), adj=0.5, shape=MSO_SHAPE.OVAL)
rect(s, 9.4, -1.6, 5.6, 5.6, fill=RGBColor(0x10, 0x24, 0x3A), adj=0.5, shape=MSO_SHAPE.OVAL)
header(s, "12 — Conclusion", "The road ahead", dark=True)

# roadmap
phases = [
    ("PHASE 1", "TODAY", "3 scored routes, SOS, citizen reports, officer console, signed Android APK", TEAL, True),
    ("PHASE 2", "NEXT", "Authenticate the backend · true distance-decay proximity · officer image viewing", CYAN, False),
    ("PHASE 3", "THEN", "Citizen sees report status · moderated community reports feeding the score", BLUE, False),
    ("PHASE 4", "LATER", "Self-hosted geospatial data · calibrated weights from incident data · city transit integration", RGBColor(0x60, 0xA5, 0xFA), False),
    ("PHASE 5", "SCALE", "Multi-city deployment · offline cached safety index · public-transport operator API", RGBColor(0x94, 0xA3, 0xB8), False),
]
px = M
for tag, when, body, c, live in phases:
    h = 2.10
    rect(s, px, 1.66, 2.30, h, fill=SLATE_800, line=None)
    rect(s, px, 1.66, 2.30, 0.055, fill=c, shape=MSO_SHAPE.RECTANGLE)
    txt(s, px + 0.18, 1.84, 1.94, 0.22, tag, size=8.5, color=c, bold=True, font=FS)
    txt(s, px + 0.18, 2.06, 1.94, 0.28, when, size=13, color=WHITE, bold=True, font=FS)
    txt(s, px + 0.18, 2.44, 1.94, 1.10, body, size=8.5, color=FAINT, spacing=1.22)
    if live:
        pill(s, px + 0.18, 3.36, 0.86, 0.24, "SHIPPING", TEAL, SLATE_900, 7)
    if px < M + 4 * 2.42:
        arrow_r(s, px + 2.32, 2.62, 0.14, RGBColor(0x33, 0x41, 0x55))
    px += 2.42

# closing statement
rect(s, M, 4.16, 12.10, 1.62, fill=TEAL, line=None)
txt(s, M + 0.46, 4.44, 11.2, 0.28, "SAFE-HER TURNS A NORMAL NAVIGATION JOURNEY INTO A SAFETY-AWARE JOURNEY.",
    size=13.5, color=SLATE_900, bold=True, font=FS)
txt(s, M + 0.46, 4.86, 11.2, 0.76,
    "Every safety score is traceable to a factor someone can inspect. Every route we offer is a choice we leave to her. "
    "And every limitation we've built — the partial-data states, the cancel window, the honest 'not implemented' list — "
    "is there because a woman making a decision at night deserves to know exactly how much to trust it.",
    size=10, color=RGBColor(0x0B, 0x2E, 0x2D), spacing=1.28)

# thank you + logo
rect(s, M, 6.02, 0.56, 0.56, fill=TEAL, adj=0.26)
txt(s, M, 6.12, 0.56, 0.36, "S", size=23, color=SLATE_900, bold=True, font=FB, align=PP_ALIGN.CENTER)
txt(s, M + 0.78, 6.06, 6.0, 0.40, "THANK YOU", size=19, color=WHITE, bold=True, font=FB)
txt(s, M + 0.78, 6.44, 7.0, 0.26, "Team Safe-Her  ·  github.com/Arunachalam-2006/safeher",
    size=9.5, color=MUTED)

txt(s, 8.20, 6.14, 4.52, 0.60, "QUESTIONS WELCOME", size=13, color=TEAL, bold=True,
    align=PP_ALIGN.RIGHT, font=FB)
footer(s, 13, dark=True)
notes(s, """CLOSE — say this:

"Safe-Her turns a normal navigation journey into a safety-aware journey.

Here's where we are and where we're going. Phase one is shipping: three scored
routes, SOS, citizen reports, an officer console, and a signed Android APK we
built in the cloud. Phase two is the honest engineering debt — authenticate the
backend, replace the binary proximity check with real distance decay, and finish
officer image viewing. Phase three closes the loop by letting a citizen see the
outcome of her own report. Beyond that, self-hosted geospatial data, weights
calibrated against real incident data, and city transit integration.

I'd like to leave you with the principle behind the roadmap rather than the
list. Every safety score we produce is traceable to a factor that someone can
inspect. We never show a number we can't explain. And every route we offer is a
choice we leave to her — we don't silently substitute, because that removes her
agency at exactly the moment she needs it.

Thank you. We're happy to take questions."

Judge may ask: "What's the one thing you'd fix first?"
Answer: "Authenticate the backend. It's the largest real gap — every engine
endpoint is currently reachable by anyone on the network. Everything else is
incremental on top of a working product; that one is a genuine hole."

Judge may ask: "Will this actually be used?"
Answer honestly: "We can't claim adoption data. What we can say is the
information gap is real, the data to close it already exists, and the whole
safety signal is inspectable — so a user can verify we're not just making up a
number." """)

prs.save("SAFE-HER_HACKATHON_PRESENTATION.pptx")
print(f"Saved: {len(prs.slides.__iter__.__self__._sldIdLst)} slides")
