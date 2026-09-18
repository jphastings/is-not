<!-- SEED — re-run $impeccable document once there's code to capture the actual tokens and components. -->

# Design

## Overview

Creative north star: **a hand-lettered sign on a cream wall**. One committed
colour, big soft letterforms, generous space, and a phrase that swaps like a
flip-board. Warm and handmade, blunt and quick. Nothing that looks like a SaaS
landing page, a Bluesky client, a review aggregator or a terminal.

## Colors

*The Committed Rule.* One moss green carries the surface: backgrounds of the
hero, buttons, the "is" side of a review, the selection state. Ink and a warm
paper neutral do the rest. "Is not" is expressed by the words and by an inverted
treatment (ink on paper vs paper on green), never by a second signal colour.

Every colour is a custom property (`--paper`, `--ink`, `--ink-soft`, `--moss`,
`--moss-deep`, `--moss-tint`, and their red counterparts `--rust`, `--rust-deep`, `--rust-tint` for removal and warnings) in `web/src/app.css`, in `oklch()`. The system
`prefers-color-scheme` is the only switch — there is no in-app toggle — and it
redefines only these tokens, so every surface built from them follows for
free.

Light is a cream paper wall (`--paper` at 97% lightness) with near-black ink
(22%) and a mid-tone moss (52%): ink on paper reaches 15.8:1, moss on paper
4.8:1. Dark is the same sign in an unlit room, not a slate developer-tool
theme: a dark warm ground (18%) with the ink and moss roles pushed lighter so
they still carry the surface — ink to 92% (14.9:1 on the dark ground), moss to
72% (8.0:1) and moss-deep to 80% (10.5:1), moss-tint down to 30% so it reads
as a raised panel rather than a glow. Button text (`--paper`) sits on moss
backgrounds either way, so the pill stays dark-text-on-green in dark mode
too — the inversion, not a new treatment.

## Typography

Chunky rounded display for the review sentence and headings; a humanist sans
for controls and body. Both chosen outside the usual defaults (no Inter, no
Fraunces, no Space Grotesk). Fluid scale with at least a 1.25 ratio between
steps; the sentence uses the largest step and wraps freely. Specific families
`[to be resolved during implementation]`.

## Elevation & Depth

Flat. Depth comes from colour blocks and paper/ink inversion, not shadows.
Borders are 1px ink at low opacity when needed; most things need none.

## Components

Controls are sentence parts: the direction select and adjective input sit
inline in the phrase, styled as words with an underline or tint, not as boxed
form fields. Buttons are pill-shaped, green, with ink text. Empty states are a
single sentence.

## Motion

Choreographed but purposeful: the homepage phrase rotates every fifteen seconds
with a staged word-by-word swap; form parts settle into the sentence as they
are filled. Ease-out curves, no bounce. `prefers-reduced-motion` reduces every
sequence to a fade.
