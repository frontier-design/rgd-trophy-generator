# RGD Generator

A workspace for shaping trophies from text and composing the resulting artwork.

## Language

### Workspace and artwork

**Canvas**:
The infinite workspace where artwork and node cards are arranged and linked.
_Avoid_: Artboard, frame

**Artboard**:
A bounded surface that displays artwork on the canvas. Its **frame** defines the width and height of that artwork, independent of the workspace zoom.
_Avoid_: Canvas

**Scene**:
A text-and-trophy artwork whose typography determines the trophy's profile.

**Composition**:
An artboard that frames and positions a live image of one linked scene without changing the scene itself.

**Repeat artboard**:
An artboard of repeating trophies separated by centered copies of one text. Its own typography and grid determine the repetition; it is not a tiling of a scene image.

**Tile**:
The repeating unit of a repeat artboard. Its width is the distance between neighboring trophy axes before any extra spacing is added.

**Text gap**:
The text-bearing space between neighboring trophies in a repeat artboard. Every gap displays the same centered text.

### Trophy and typography

**Rag**:
The uneven edge formed by the ends of the lines in a text block.

**Line box**:
The padded, rounded footprint of one line of text used to carve a groove in the trophy's profile.

**Revolve axis**:
The vertical line at the right edge of the text column around which the flat profile is rotated to make the trophy.

**Top band**:
The uncarved part of the profile above the first line's groove.

**2D sketch**:
The flat artwork view that shows the profile instead of the revolved trophy.

**Mirror**:
The layout that places a reflected, right-aligned copy of the text block on the other side of the trophy. The text remains readable rather than flipped.

**Palette**:
The ordered color stops that color the trophy. In lit shading the stops map shadows to highlights; in painted shading they form bands across the trophy.

### Nodes and motion

**Node card**:
The on-canvas controls for a node such as text, a modifier, or the master. A card is distinct from an artwork artboard.
_Avoid_: Artboard, component

**Link**:
A connection from an output port to an input port that makes one node's contribution available to another.

**Master node**:
The one node that holds settings shared across the canvas's scenes without requiring links.

**Modifier node**:
A source of settings for linked artwork. Shape controls the profile; material and lighting control shading; twist cuts flutes into the solid; etch, pattern, and texture add surface detail.

**Group**:
A collection of nodes with one shared output port. That output carries the contributions of the group's unmuted members.
_Avoid_: Cluster

**Typing animation**:
A text node's timed sequence of line arrivals, optional holds, and optional backspace. Lines can arrive character by character or all at once.

**Animation clock**:
The shared canvas time used to evaluate animated node properties, separate from a text node's typing sequence.

**Record node**:
The preview and video-export controls for a linked scene or repeat artboard. Its timeline combines the source's motion with optional opening and closing holds.
