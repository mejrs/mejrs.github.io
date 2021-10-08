# RuneScape Cartography

This was developed as part of the [RuneScape Wiki](https://runescape.wiki/ "The RuneScape Wiki") maps project.

## Cloning

If you'd like you can clone the repository and use it locally. Most of the data used is located in git submodules. As such you need to initialize those as well. You can do that with:
```text
git clone --recurse-submodules https://github.com/mejrs/mejrs.github.io.git
```

Note that you can not simply open this in your browser - you need to set up a local HTTP server to run it..

## Maptile rendering

The data in this repository can be generated using [https://github.com/mejrs/rs3cache/](https://github.com/mejrs/rs3cache/ "Tools and api for reading and interpreting the RuneScape 3 game cache.").
For more information on how the maptiles are built, see [this document](https://docs.google.com/document/d/1xv7iVBkG6eWDrXFhIYi77AVodJc0D-4Aqn0ncZXKJfw/edit# "RuneScape Wiki Maps Project - Google Docs").