#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import json
import shutil
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFilter, ImageOps


MADRID_TZ = ZoneInfo("Europe/Madrid")
DEFAULT_ENDPOINT = "https://eventos.aldeapucela.org/site-data.json"
DEFAULT_DAYS = 3
DEFAULT_LIMIT = 6
USER_AGENT = "aldeapucela-eventos-poster/1.0"
DEFAULT_MODE = "next-days"
DEFAULT_STORY_BASE = "src/assets/social-base-story.png"
DEFAULT_POST_BASE = "src/assets/social-base-post.png"
DEFAULT_WEEKEND_STORY_BASE = "src/assets/social-base-finde-story.png"
DEFAULT_WEEKEND_POST_BASE = "src/assets/social-base-finde-post.png"
DEFAULT_STORY_OUTPUT = "scratch/posters/proximos-story.png"
DEFAULT_POST_OUTPUT = "scratch/posters/proximos-post.png"
DEFAULT_WEEKEND_STORY_OUTPUT = "scratch/posters/proximos-weekend-story.png"
DEFAULT_WEEKEND_POST_OUTPUT = "scratch/posters/proximos-weekend-post.png"


@dataclass
class Event:
    title: str
    starts_at: datetime
    image_url: str
    venue: str
    url: str


@dataclass
class PosterJob:
    base_path: Path
    output_path: Path
    label: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Genera un poster de eventos sobre una imagen base."
    )
    parser.add_argument("--base", help="Ruta de la imagen base.")
    parser.add_argument("--output", help="Ruta del PNG final.")
    parser.add_argument("--story-base", help="Ruta de la base 9:16. Si no se indica, usa la base por defecto del modo.")
    parser.add_argument("--story-output", help="Ruta del PNG final 9:16.")
    parser.add_argument("--post-base", help="Ruta de la base 4:5. Si no se indica, usa la base por defecto del modo.")
    parser.add_argument("--post-output", help="Ruta del PNG final 4:5.")
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_ENDPOINT,
        help=f"Endpoint JSON de eventos. Por defecto: {DEFAULT_ENDPOINT}",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAYS,
        help=f"Ventana de dias futuros a incluir. Por defecto: {DEFAULT_DAYS}",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Numero maximo de eventos. Por defecto: {DEFAULT_LIMIT}",
    )
    parser.add_argument(
        "--mode",
        choices=("next-days", "next-weekend"),
        default=DEFAULT_MODE,
        help="Modo de seleccion: proximos dias variados o siguiente fin de semana.",
    )
    parser.add_argument(
        "--cache-dir",
        default=".cache/poster-images",
        help="Directorio local para cachear imagenes descargadas.",
    )
    parser.add_argument(
        "--keep-cache",
        action="store_true",
        help="Conserva la cache temporal de imagenes al terminar.",
    )
    return parser.parse_args()


def fetch_json(url: str) -> dict:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def parse_iso_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=MADRID_TZ)
    return parsed.astimezone(MADRID_TZ)


def normalize_event(raw: dict) -> Event | None:
    starts_at = parse_iso_datetime(raw.get("startsAtIso") or raw.get("startsAt"))
    image_url = (raw.get("image") or "").strip()
    event_id = str(raw.get("id") or "").strip()
    slug = str(raw.get("slug") or "").strip()
    if not starts_at or not image_url or not event_id or not slug:
        return None
    return Event(
        title=str(raw.get("title") or "").strip(),
        starts_at=starts_at,
        image_url=image_url,
        venue=str(raw.get("venueLabel") or raw.get("venue") or raw.get("location") or "").strip(),
        url=f"https://eventos.aldeapucela.org/e/{event_id}/{slug}",
    )


def madrid_day_key(value: datetime) -> str:
    return value.astimezone(MADRID_TZ).strftime("%Y-%m-%d")


def select_spread_events(events: list[Event], limit: int) -> list[Event]:
    grouped: dict[str, list[Event]] = {}
    ordered_days: list[str] = []

    for event in events:
        key = madrid_day_key(event.starts_at)
        if key not in grouped:
            grouped[key] = []
            ordered_days.append(key)
        grouped[key].append(event)

    selected: list[Event] = []
    seen: set[tuple[str, str]] = set()

    while len(selected) < limit:
        added_this_round = False
        for day in ordered_days:
            items = grouped.get(day, [])
            while items:
                candidate = items.pop(0)
                key = (candidate.title.casefold(), candidate.starts_at.isoformat())
                if key in seen:
                    continue
                seen.add(key)
                selected.append(candidate)
                added_this_round = True
                break
            if len(selected) >= limit:
                break
        if not added_this_round:
            break

    return selected


def select_events_next_days(payload: dict, days: int, limit: int) -> list[Event]:
    now = datetime.now(MADRID_TZ)
    start_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_day = start_day + timedelta(days=max(days, 1))
    candidates: list[Event] = []

    for raw in payload.get("events", []):
        event = normalize_event(raw)
        if not event:
            continue
        if event.starts_at < now:
            continue
        if event.starts_at >= end_day:
            continue
        candidates.append(event)

    candidates.sort(key=lambda event: event.starts_at)
    return select_spread_events(candidates, limit)


def next_weekday(anchor: date, weekday: int) -> date:
    delta = (weekday - anchor.weekday()) % 7
    if delta == 0:
        delta = 7
    return anchor + timedelta(days=delta)


def select_events_next_weekend(payload: dict, limit: int) -> list[Event]:
    now = datetime.now(MADRID_TZ)
    today = now.date()
    next_friday = next_weekday(today, 4)
    friday_start = datetime.combine(next_friday, time(15, 0), MADRID_TZ)
    monday_start = datetime.combine(next_friday + timedelta(days=3), time(0, 0), MADRID_TZ)

    candidates: list[Event] = []
    for raw in payload.get("events", []):
        event = normalize_event(raw)
        if not event:
            continue
        if event.starts_at < friday_start:
            continue
        if event.starts_at >= monday_start:
            continue
        candidates.append(event)

    candidates.sort(key=lambda event: event.starts_at)
    return select_spread_events(candidates, limit)


def select_events(payload: dict, days: int, limit: int, mode: str) -> list[Event]:
    if mode == "next-weekend":
        return select_events_next_weekend(payload, limit)
    return select_events_next_days(payload, days, limit)


def download_image(url: str, cache_dir: Path) -> Image.Image:
    cache_dir.mkdir(parents=True, exist_ok=True)
    filename = url.split("?")[0].rstrip("/").split("/")[-1] or "image"
    safe_name = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in filename)
    target = cache_dir / safe_name

    if target.exists():
        return Image.open(target).convert("RGB")

    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        data = response.read()
    target.write_bytes(data)
    return Image.open(io.BytesIO(data)).convert("RGB")


def fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def add_card_shadow(base: Image.Image, box: tuple[int, int, int, int], radius: int) -> None:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rounded_rectangle(box, radius=radius, fill=(0, 0, 0, 85))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(8, radius // 2)))
    base.alpha_composite(shadow, dest=(0, 0))


def get_grid_geometry(size: tuple[int, int]) -> dict[str, int]:
    width, height = size
    is_story = height / width > 1.6

    if is_story:
        top = round(height * 0.305)
        bottom = round(height * 0.765)
        side = round(width * 0.06)
        h_gap = round(width * 0.022)
        v_gap = round(height * 0.026)
        cols = 3
        rows = 2
    else:
        top = round(height * 0.33)
        bottom = round(height * 0.77)
        side = round(width * 0.13)
        h_gap = round(width * 0.028)
        v_gap = round(height * 0.018)
        cols = 3
        rows = 2

    available_w = width - side * 2 - h_gap * (cols - 1)
    card_w = available_w // cols
    available_h = bottom - top - v_gap * (rows - 1)
    card_h = available_h // rows

    return {
        "top": top,
        "bottom": bottom,
        "side": side,
        "h_gap": h_gap,
        "v_gap": v_gap,
        "card_w": card_w,
        "card_h": card_h,
        "radius": max(18, round(min(card_w, card_h) * 0.06)),
        "stroke": max(4, round(card_w * 0.014)),
        "cols": cols,
        "rows": rows,
    }


def layout_counts(event_count: int) -> list[int]:
    if event_count <= 0:
        return []
    if event_count == 1:
        return [1]
    if event_count == 2:
        return [2]
    if event_count == 3:
        return [3]
    if event_count == 4:
        return [2, 2]
    if event_count == 5:
        return [3, 2]
    return [3, 3]


def card_boxes(size: tuple[int, int], event_count: int) -> list[tuple[int, int, int, int]]:
    grid = get_grid_geometry(size)
    counts = layout_counts(event_count)
    if not counts:
        return []

    rows = len(counts)
    max_cols = max(counts)
    available_h = grid["bottom"] - grid["top"] - grid["v_gap"] * max(rows - 1, 0)
    card_h = available_h // rows
    available_w = size[0] - grid["side"] * 2 - grid["h_gap"] * max(max_cols - 1, 0)
    card_w = available_w // max_cols

    boxes: list[tuple[int, int, int, int]] = []
    for row, cols_in_row in enumerate(counts):
        row_width = cols_in_row * card_w + max(cols_in_row - 1, 0) * grid["h_gap"]
        start_x = round((size[0] - row_width) / 2)
        y = grid["top"] + row * (card_h + grid["v_gap"])
        for col in range(cols_in_row):
            x = start_x + col * (card_w + grid["h_gap"])
            boxes.append((x, y, x + card_w, y + card_h))
    return boxes


def draw_empty_slot(base: Image.Image, box: tuple[int, int, int, int], radius: int, stroke: int) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle(box, radius=radius, fill=(255, 251, 246, 72), outline=(255, 255, 255, 140), width=stroke)
    overlay = overlay.filter(ImageFilter.GaussianBlur(1))
    base.alpha_composite(overlay)


def paste_card(base: Image.Image, photo: Image.Image, box: tuple[int, int, int, int], radius: int, stroke: int) -> None:
    x1, y1, x2, y2 = box
    size = (x2 - x1, y2 - y1)
    fitted = fit_cover(photo, size).convert("RGBA")

    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)

    add_card_shadow(base, box, radius)
    base.paste(fitted, (x1, y1), mask)

    border_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(border_layer)
    draw.rounded_rectangle(box, radius=radius, outline=(255, 249, 242, 235), width=stroke)
    base.alpha_composite(border_layer)


def compose_poster(base_path: Path, output_path: Path, events: list[Event], cache_dir: Path) -> int:
    base = Image.open(base_path).convert("RGBA")
    boxes = card_boxes(base.size, len(events))
    if not boxes:
        return 0

    min_dimension = min(boxes[0][2] - boxes[0][0], boxes[0][3] - boxes[0][1])
    radius = max(18, round(min_dimension * 0.06))
    stroke = max(4, round((boxes[0][2] - boxes[0][0]) * 0.014))

    count = 0
    for event, box in zip(events, boxes):
        try:
            photo = download_image(event.image_url, cache_dir)
            paste_card(base, photo, box, radius, stroke)
            count += 1
        except (HTTPError, URLError, OSError):
            continue

    output_path.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(output_path, format="PNG")
    return count


def build_jobs(args: argparse.Namespace) -> list[PosterJob]:
    jobs: list[PosterJob] = []
    default_story_base = (
        DEFAULT_WEEKEND_STORY_BASE if args.mode == "next-weekend" else DEFAULT_STORY_BASE
    )
    default_post_base = (
        DEFAULT_WEEKEND_POST_BASE if args.mode == "next-weekend" else DEFAULT_POST_BASE
    )
    default_story_output = (
        DEFAULT_WEEKEND_STORY_OUTPUT if args.mode == "next-weekend" else DEFAULT_STORY_OUTPUT
    )
    default_post_output = (
        DEFAULT_WEEKEND_POST_OUTPUT if args.mode == "next-weekend" else DEFAULT_POST_OUTPUT
    )

    if args.base or args.output:
        if not args.base or not args.output:
            print("Si usas --base tambien debes indicar --output.", file=sys.stderr)
            raise SystemExit(1)
        jobs.append(PosterJob(Path(args.base), Path(args.output), "single"))

    wants_story = bool(args.story_base or args.story_output)
    wants_post = bool(args.post_base or args.post_output)

    if not jobs and not wants_story and not wants_post:
        wants_story = True
        wants_post = True

    if wants_story:
        jobs.append(
            PosterJob(
                Path(args.story_base or default_story_base),
                Path(args.story_output or default_story_output),
                "story",
            )
        )

    if wants_post:
        jobs.append(
            PosterJob(
                Path(args.post_base or default_post_base),
                Path(args.post_output or default_post_output),
                "post",
            )
        )

    return jobs


def main() -> int:
    args = parse_args()
    cache_dir = Path(args.cache_dir)
    jobs = build_jobs(args)

    for job in jobs:
        output_path = job.output_path
        if not (
            str(output_path).startswith("scratch/posters/")
            or str(output_path).startswith("./scratch/posters/")
        ):
            print(
                "Las salidas deben escribirse dentro de scratch/posters/ para evitar artefactos trackeados por git.",
                file=sys.stderr,
            )
            return 1

    for job in jobs:
        if not job.base_path.exists():
            print(f"No existe la imagen base para {job.label}: {job.base_path}", file=sys.stderr)
            return 1

    try:
        payload = fetch_json(args.endpoint)
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        print(f"No se pudo cargar el endpoint de eventos: {exc}", file=sys.stderr)
        return 1

    events = select_events(payload, args.days, args.limit, args.mode)
    result: dict[str, object] = {
        "mode": args.mode,
        "days": args.days,
        "eventsRequested": args.limit,
        "eventCount": len(events),
        "hasEvents": bool(events),
        "assets": [],
    }

    try:
        assets: list[dict[str, object]] = []
        for job in jobs:
            rendered = 0
            if events:
                rendered = compose_poster(job.base_path, job.output_path, events, cache_dir)
            assets.append(
                {
                    "label": job.label,
                    "base": str(job.base_path),
                    "output": str(job.output_path),
                    "eventsRendered": rendered,
                }
            )
        result["assets"] = assets
        print(json.dumps(result, ensure_ascii=True))
        return 0
    finally:
        if not args.keep_cache:
            shutil.rmtree(cache_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
