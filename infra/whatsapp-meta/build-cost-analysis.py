"""IFC-035: builds artifacts/reports/cost-analysis.xlsx (inputs sourced and dated, costs as live formulas).

Run: python infra/whatsapp-meta/build-cost-analysis.py
Yellow input cells are assumptions the owner can change in Excel; the Costs sheet recalculates.
"""
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill

OUT = Path(__file__).resolve().parents[2] / "artifacts" / "reports" / "cost-analysis.xlsx"
BOLD = Font(bold=True)
HEAD = PatternFill("solid", fgColor="DDE6F0")
ASSUME = PatternFill("solid", fgColor="FFF2CC")

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Inputs"
rows = [
    ("IFC-035 WhatsApp cost model. Yellow cells are assumptions you can change; the rest is sourced or a formula.", None, None, None),
    ("Item", "Value", "Unit", "Source / status"),
    ("Meta UK marketing rate", 0.0458, "GBP per delivered message", "Meta GBP list rates file, effective 1 Oct 2026, row United Kingdom; read 2026-11-22"),
    ("Meta UK utility rate", 0.0159, "GBP per delivered message", "same file"),
    ("Meta UK authentication rate", 0.0159, "GBP per delivered message", "same file"),
    ("Meta UK service rate", 0.0159, "GBP per delivered message", "same file; service messages are charged from 1 Oct 2026"),
    ("Free service messages per business number per month", 1000, "messages", "developers.facebook.com/docs/whatsapp/pricing, read 2026-11-22 (from 1 Oct 2026; no roll over)"),
    ("UK volume tiers (utility, authentication)", "list rate up to 100,000 utility / 300,000 authentication per month", "", "Meta GBP volume tiers file: no discount at this scale"),
    ("Railway memory", 10, "USD per GiB per month", "ADR-089, read 2026-11-21"),
    ("Railway CPU", 20, "USD per vCPU per month", "ADR-089"),
    ("Railway volume", 0.15, "USD per GB per month", "ADR-089"),
    ("WAHA idle container (measured with docker stats)", 0.3219, "GiB", "ADR-089 spike, 2026-11-21"),
    ("WAHA memory per paired session", 0.2, "GiB", "ASSUMPTION from the design doc; UNVERIFIED, no real number was paired"),
    ("Free-text replies sent per customer per month", 300, "service messages", "ASSUMPTION (a small UK service business)"),
    ("Business-started utility templates per customer per month", 20, "messages", "ASSUMPTION"),
    ("Marketing templates per customer per month", 0, "messages", "Design rule: reply, do not start conversations; 0 for now"),
    ("Heavy-use multiplier for the sensitivity row", 5, "x", "ASSUMPTION"),
]
for r in rows:
    ws.append(r)
ws["A1"].font = BOLD
for c in ws[2]:
    c.font = BOLD
    c.fill = HEAD
for i in range(13, 18):
    ws.cell(row=i, column=2).fill = ASSUME
for col, w in zip("ABCD", (62, 24, 26, 100)):
    ws.column_dimensions[col].width = w

s = wb.create_sheet("Costs")
s.append(["Monthly cost for 1, 10 and 100 customers (each customer has one business number)", "", "", "", ""])
s["A1"].font = BOLD
s.append(["Line", "1 customer", "10 customers", "100 customers", "Note"])
for c in s[2]:
    c.font = BOLD
    c.fill = HEAD
s.append(["Customers", 1, 10, 100, ""])
COLS = "BCD"


def line(label, formula, note=""):
    r = s.max_row + 1
    s.cell(row=r, column=1, value=label)
    for col in COLS:
        s[f"{col}{r}"] = formula.replace("{c}", col) if isinstance(formula, str) else formula
    s.cell(row=r, column=5, value=note)
    return r


s.append(["TRANSPORT A: META CLOUD API (GBP)", "", "", "", ""])
s.cell(row=s.max_row, column=1).font = BOLD
a1 = line("Service messages sent, total", "={c}3*Inputs!$B$14")
a2 = line("Free service messages (1,000 per number)", f"=MIN({{c}}{a1},{{c}}3*Inputs!$B$7)")
a3 = line("Charged service messages", f"={{c}}{a1}-{{c}}{a2}")
a4 = line("Service cost", f"={{c}}{a3}*Inputs!$B$6")
a5 = line("Utility template cost", "={c}3*Inputs!$B$15*Inputs!$B$4")
a6 = line("Marketing template cost", "={c}3*Inputs!$B$16*Inputs!$B$3")
a7 = line("Meta total (GBP / month)", f"={{c}}{a4}+{{c}}{a5}+{{c}}{a6}", "No hosting: the Aurora API already receives the webhook. No platform fee is stated on the pricing page.")
line("Meta per customer (GBP / month)", f"={{c}}{a7}/{{c}}3")
line("Sensitivity: heavy use (GBP / month)", f"=MAX(0,{{c}}3*Inputs!$B$14*Inputs!$B$17-{{c}}3*Inputs!$B$7)*Inputs!$B$6+{{c}}{a5}+{{c}}{a6}", "Replies above 1,000 per number per month cost the service rate.")
s.append([])
s.append(["TRANSPORT B: WAHA, one shared container (USD)", "", "", "", ""])
s.cell(row=s.max_row, column=1).font = BOLD
b1 = line("Container baseline memory", "=Inputs!$B$12*Inputs!$B$9", "0.3219 GiB x $10")
b2 = line("Paired-session memory", "={c}3*Inputs!$B$13*Inputs!$B$9", "ASSUMPTION 0.2 GiB per paired session; UNVERIFIED")
b3 = line("CPU and volume", "=0.02+Inputs!$B$11", "ADR-089: about $0.02 CPU plus a 1 GB volume")
b4 = line("WAHA hosting total (USD / month)", f"={{c}}{b1}+{{c}}{b2}+{{c}}{b3}")
line("WAHA per customer (USD / month)", f"={{c}}{b4}/{{c}}3")
line("Meta fees on this transport", 0, "None: WAHA sends through a WhatsApp Web session. The risk is a ban, not a bill.")
s.append([])
s.append(["NOT INCLUDED"])
s.cell(row=s.max_row, column=1).font = BOLD
for t in (
    "Railway plan fee (Hobby $5 with $5 included, Pro $20 with $20 included; per workspace, shared; ADR-089). The first few tenants fit inside the included credit.",
    "A WAHA container ceiling: not set until a paired session is measured (IFC-331). At 100 tenants the memory line implies several containers.",
    "Business verification documents, a SIM or number rental, and any partner (BSP) fees: not found on the pages read; any spend is the owner's decision.",
    "Currency conversion: Meta is priced in GBP and Railway in USD; they are deliberately not converted here (no sourced rate is used). Finance converts at its own rate.",
    "Cost of a ban: a banned WAHA number loses its chats. Not priced; it is the risk the customer accepts in the notice.",
):
    s.append([t])
s.column_dimensions["A"].width = 66
for col in COLS:
    s.column_dimensions[col].width = 18
s.column_dimensions["E"].width = 100
OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)


def meta(n, svc=300, ut=20, mk=0, mult=1):
    tot = n * svc * mult
    free = min(tot, n * 1000)
    return (tot - free) * 0.0159 + n * ut * 0.0159 + n * mk * 0.0458


def waha(n):
    return 0.3219 * 10 + n * 0.2 * 10 + 0.02 + 0.15


for n in (1, 10, 100):
    print(n, "meta GBP", round(meta(n), 2), "per", round(meta(n) / n, 3), "heavy", round(meta(n, mult=5), 2), "| waha USD", round(waha(n), 2), "per", round(waha(n) / n, 2))
