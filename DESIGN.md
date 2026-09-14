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
Exact values `[to be resolved during implementation]`.

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
