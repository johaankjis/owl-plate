"""Generate an editable, evidence-honest PowerPoint for Johaan's final rehearsal."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.slide import Slide
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]


def build_deck() -> Path:
    """Keep a reproducible local submission artifact without inventing collected evidence."""
    presentation = Presentation()
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)
    slides = [
        (
            "Owl Plate",
            "One photo. A meal finds its next person.",
            [
                "CampusOS · KSU AI Club Hackathon 2026",
                "Student prototype · synthetic demo accounts",
            ],
            "0:00–0:15. Open with the club meeting story. A host has leftovers; a student needs a meal. This is a prototype hypothesis, not a measured campus statistic.",
        ),
        (
            "A short window to share",
            "Leftover food needs a clear path from host to student.",
            [
                "Hosts need a quick way to describe what is left.",
                "Students need timely, useful alerts for food they can eat.",
                "Campus survey: pending · actual responses n = 0",
            ],
            "0:15–1:00. State the problem as a design hypothesis. Insert actual aggregate survey results only after collection, with n and collection dates. Do not claim KSU policy approval or campus prevalence.",
        ),
        (
            "Photo → review → invite",
            "Gemini describes the food. Deterministic rules dispatch it.",
            [
                "Host reviews servings, estimated allergens and safety checklist.",
                "Allergy and diet filters run before ranking.",
                "Capacity is checked when a student holds a serving.",
                "Allergens: may contain, confirm with host.",
            ],
            "1:00–2:00. AI estimates; the host confirms. The engine decides eligibility and ranks; the LLM never chooses recipients. Declare whether live Gemini or clearly labeled cached fixture is being shown.",
        ),
        (
            "The first wave",
            "A and C are invited. B stays safe. D waits for a wider ring.",
            [
                "A: nearby · invite",
                "B: dairy conflict · excluded",
                "C: compatible · invite",
                "D: outside ring 2 · waits",
                "E: vegetarian preference · suitable drops only",
                "All five personas are simulated. No private tier appears.",
            ],
            "2:00–3:00. Photograph the tray, review, publish. Show projector and phones together. Claim physical push delivery only after observing authorized Android and Home Screen iPhone receipt.",
        ),
        (
            "Hold one. Widen the search.",
            "A holds a serving. C expires. D enters wave two.",
            [
                "One active hold uses one available serving for 10 minutes.",
                "Unanswered demo invites expire after 60 seconds.",
                "H3 ring widens from 2 to 4; prior invitees are not contacted again.",
                "Invites may exceed servings; transactional claims prevent overbooking.",
            ],
            "3:00–4:00. Tap A claim. Show available/held counts. Let C expire or explicitly narrate demo clock advance. Show D enters wave two. A simulated notification log does not prove device receipt.",
        ),
        (
            "Built to explain and rehearse",
            "Next.js PWA → FastAPI → pure Python planner",
            [
                "Gemini: structured vision estimate with host correction",
                "H3 + deck.gl: eligibility rings and safe demo explanations",
                "SQLModel: atomic holds · FCM adapter: uniform alerts",
                "Offline fixture + demo auth: repeatable backup",
            ],
            "4:00–4:35. Explain the boundaries and privacy. Deployment targets: Vercel web, AWS API/Postgres, temporary S3 photos. These are targets, not completed deployments. Backend planner never imports network/database code.",
        ),
        (
            "Next: verify the evidence",
            "A reliable demo, then a policy-approved pilot.",
            [
                "Verify Android + Home Screen iPhone delivery.",
                "Measure vision on hand-labeled photos; results pending.",
                "Collect survey responses and report actual n.",
                "Confirm campus food policy and partner access before a pilot.",
            ],
            "4:35–5:00. Replace pending items with actual evidence after rehearsal. No invented metrics, partners or policy approval. Mention meal swipes as future scope only. Johaan submits by Friday noon Eastern.",
        ),
    ]
    for index, (title, subtitle, bullets, notes) in enumerate(slides):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        slide.background.fill.solid()
        slide.background.fill.fore_color.rgb = RGBColor.from_string("132D25")

        def text_box(
            x: float,
            y: float,
            w: float,
            h: float,
            text: str,
            size: int,
            color: str,
            slide: Slide = slide,
        ) -> None:
            box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
            frame = box.text_frame
            frame.word_wrap = True
            frame.text = text
            for paragraph in frame.paragraphs:
                paragraph.font.size = Pt(size)
                paragraph.font.color.rgb = RGBColor.from_string(color)
                paragraph.font.name = "Aptos"

        text_box(0.7, 0.5, 12, 0.7, title, 38, "F4C74D")
        text_box(0.7, 1.4, 12, 1, subtitle, 27, "FFFFFF")
        text_box(
            0.9, 2.7, 11.6, 3.8, "\n\n".join(bullets), 22 if len(bullets) < 6 else 20, "E4EEE8"
        )
        text_box(
            0.7,
            7,
            12,
            0.3,
            f"OWL PLATE  /  LOCAL REHEARSAL DRAFT  /  {index + 1:02d}",
            10,
            "A8C2B5",
        )
        slide.notes_slide.notes_text_frame.text = notes
    output = ROOT / "submission" / "Owl_Plate_Pitch.pptx"
    presentation.save(output)
    return output


if __name__ == "__main__":
    print(build_deck())
