bald-eagle.jpg — Bald eagle in flight, National Conservation Training Center.
Photographer: Todd Harless / U.S. Fish and Wildlife Service, 2006-03-06.
Source: https://www.fws.gov/media/bald-eagle-flight-5
Public domain (U.S. government work) — no copyright restrictions, no attribution legally
required, credited here anyway as good practice.

bald-eagle-cutout.png — the same photo with the sky background removed (color-threshold
chroma-key + spill suppression + connected-component cleanup, done locally; script not
checked in), leaving a transparent-background PNG of just the eagle. Same public-domain
source and license as above; the transparency doesn't change that.

bald-eagle-perched-cutout-v3.png — Bald eagle perched on a branch, alert posture. Original
photo looks left; mirrored horizontally so the eagle faces away from the login form (out
toward the right edge of the page) rather than in toward it, since it sits in the top-right
corner. Photographer: Bill Wallen, October 2020. Source: https://www.fws.gov/media/bald-eagle-branch
Public domain (U.S. government work) — no copyright restrictions, no attribution legally
required, credited here anyway as good practice. Background removed locally (edge-detection
flood fill from the image border rather than a color threshold, since this photo's sky
gradient runs from blue at the top to near-white haze at the bottom; script not checked
in), leaving a transparent-background PNG of the eagle and the branch it's gripping.

The dense fine texture of the head plumage needed a morphological closing pass on the edge
map before the flood fill, or the fill found thin gaps between adjacent feather edges and
leaked all the way through the head, hollowing most of it out (fixed in v2). Even after
that, the crown's wispy flyaway feathers against sky left a wide (~150-200px), genuinely
gradual transition that no reasonable edge-closing radius fully sealed, leaving a stepped
bite out of the top of the head (v2's residual bug). v3 fixes this by closing the final
silhouette itself with a large-radius disk (via a distance-transform, not a literal huge
kernel, which would be far too slow at this resolution) to round over that zone, guarded
by a color check that only keeps newly-added pixels if they're not sky-colored -- without
that guard, the same large radius would also wrongly paint over the real, wider gap of
visible sky between the tail and the branch below.
