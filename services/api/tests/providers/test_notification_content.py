"""Lock-screen wording comes only from the published listing and leaks nothing private."""

import pytest

from services.api.providers.notification_content import build_alert_content, food_emoji


def content(**overrides):
    base = {
        "item_names": ["Margherita pizza"],
        "servings_available": 5,
        "building_name": "Atrium Building",
        "building_code": "ATRIUM",
        "room": "120",
    }
    return build_alert_content(**{**base, **overrides})


def test_pizza_example_matches_the_requested_wording() -> None:
    alert = content()
    assert alert.title == "🍕 Free Margherita pizza on campus!"
    assert alert.body == "5 servings at Atrium Building, Room 120. Reserve yours before it's gone!"


@pytest.mark.parametrize(
    ("name", "emoji"),
    [
        ("Pepperoni pizza slices", "🍕"),
        ("Roasted whole chicken", "🍗"),
        ("Turkey sandwiches", "🥪"),
        ("Garden salad", "🥗"),
        ("Chocolate chip cookies", "🍪"),
        ("Vegetable biryani", "🍚"),
        ("Assorted pastries", "🥐"),
        ("Mystery tray", "🍽️"),
    ],
)
def test_food_emoji_follows_the_reviewed_name_and_never_guesses(name: str, emoji: str) -> None:
    assert food_emoji([name]) == emoji
    assert content(item_names=[name]).title == f"{emoji} Free {name} on campus!"


def test_missing_room_omits_the_room_instead_of_inventing_one() -> None:
    for blank in ("", "   "):
        assert content(room=blank).body == (
            "5 servings at Atrium Building. Reserve yours before it's gone!"
        )


def test_single_serving_is_singular() -> None:
    assert content(servings_available=1).body.startswith("1 serving at ")


def test_multiple_items_stay_short_and_use_the_actual_names() -> None:
    two = content(item_names=["Pizza", "Garden salad"]).title
    assert two == "🍕 Free Pizza and Garden salad on campus!"
    many = content(item_names=["Pizza", "Salad", "Cookies", "Brownies"]).title
    assert many == "🍕 Free Pizza, Salad and 2 more on campus!"


def test_long_names_are_bounded() -> None:
    title = content(item_names=["Extra large hand tossed pepperoni and mushroom pizza pie"]).title
    assert len(title) <= 60 and "…" in title


def test_building_falls_back_to_the_host_chosen_code_but_never_to_an_internal_slug() -> None:
    assert content(building_name=None, building_code="DEMO-ORIGIN").body.startswith(
        "5 servings at DEMO-ORIGIN, Room 120."
    )
    slug = content(building_name=None, building_code="ksu-marietta-atrium", room="")
    assert slug.body == "5 servings available. Reserve yours before it's gone!"


def test_control_and_direction_characters_are_removed() -> None:
    alert = content(item_names=["Pi\u202ezza\n\tslices"], room="1\u200b20")
    assert "\u202e" not in alert.title and "\n" not in alert.title
    assert "Room 1 20" in alert.body


def test_text_never_contains_private_detail() -> None:
    alert = content(item_names=["Dairy-free vegan pizza"])
    text = f"{alert.title} {alert.body}".lower()
    for private in ("student", "nickname", "token", "priority", "care services", "allerg"):
        assert private not in text
