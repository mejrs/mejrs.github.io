import "../leaflet.js";
import "./leaflet.displays.js"

export default void function (factory) {
    var L;
    if (typeof define === "function" && define.amd) {
        define(["leaflet"], factory)
    } else if (typeof module !== "undefined") {
        L = require("leaflet");
        module.exports = factory(L)
    } else {
        if (typeof window.L === "undefined") {
            throw new Error("Leaflet must be loaded first")
        }
        factory(window.L)
    }
}
(function (L) {

    // -------------------------
    // Vertex styling
    // -------------------------
    let VertexIcon = L.DivIcon.extend({
        options: {
            className: "leaflet-div-icon"
        }
    });
    let GhostVertexIcon = L.DivIcon.extend({
        options: {
            className: "leaflet-div-icon ghost-vertex"
        }
    });

    // -------------------------
    // Vertex marker
    // -------------------------
    let Vertex = L.Marker.extend({
        initialize: function (latlng, owner, isActive = false) {
            L.Util.setOptions(this, {
                draggable: true,
                icon: new VertexIcon(),
                owner: owner
            });

            this._latlng = L.latLng(latlng);
        },

        onAdd: function (map) {
            this.on("drag", this.onDrag.bind(this));
            this.on("dragstart", this.onDragStart.bind(this));
            this.on("click", this.onClick.bind(this))
            this.on("dragend", this.onDragEnd.bind(this));
            this.on("contextmenu", this.onRightClick.bind(this));
            let el = L.Marker.prototype.onAdd.call(this, map);
            this.setActive(true);
            return el;
        },


        onClick: function () {
            this.options.owner.setActiveVertex(this);
            this.options.owner._isDragging = false;
        },

        onDragStart: function () {
            this.options.owner.setActiveVertex(this);
            this.options.owner._isDragging = true;
            this.options.owner.removeGhostVertex();
        },

        onDrag: function (e) {
            this.options.owner.onVertexDrag(this, e);
        },

        onDragEnd: function () {
            let owner = this.options.owner;
            owner._isDragging = false;
            // ignore vertex add through click events, because this next click event is fired from a drag
            owner._ignoreVertexAdd = true;
            setTimeout(() => owner._ignoreVertexAdd = false, 200);
        },

        onRightClick: function () {
            this.options.owner.removeVertex(this);
        },

        setActive: function(active) {
            let el = this.getElement();
            if (!el) return;

            if (active) {
                L.DomUtil.addClass(el, "vertex-active");
            } else {
                L.DomUtil.removeClass(el, "vertex-active");
            }
        },
    });

    // -------------------------
    // Polygon editor
    // -------------------------
    L.DraggablePolygon = L.Polygon.extend({

        initialize: function (latLngs, options) {
            this.vertices = [];
            this._activeVertex = null;
            this._isDragging = false;
            this._ignoreVertexAdd = false;

            this._ghostVertex = null;
            this._ghostLatLng = null;

            L.Polygon.prototype.initialize.call(this, latLngs || [], options);
        },

        onAdd: function (map) {
            this._map = map;

            map.on("click", this.addVertexFromClick, this);
            map.on("mousemove", this.onMouseMove, this);
            map.on("mouseout", this.onMouseOut, this);

            this.vertices.forEach(v => v.addTo(map));

            this.redrawPolygon();

            return L.Polygon.prototype.onAdd.call(this, map);
        },

        onRemove: function (map) {
            map.off("click", this.addVertexFromClick, this);
            map.off("mousemove", this.onMouseMove, this);
            map.off("mouseout", this.onMouseOut, this);

            this.removeGhostVertex();

            this.vertices.forEach(v => v.remove());

            return L.Polygon.prototype.onRemove.call(this, map);
        },

        // -------------------------
        // Vertex creation
        // -------------------------
        createVertex: function (latlng, isActive = false) {
            return new Vertex(latlng, this, isActive);
        },

        setActiveVertex: function(vertex) {
            this._activeVertex = vertex;
            this.refreshVertexStyles();
        },

        createGhostVertex: function () {
            this._ghostVertex = L.marker([0, 0], {
                interactive: false,
                keyboard: false,
                opacity: 0.4,
                zIndexOffset: -10,
                icon: new GhostVertexIcon(),
            });

            this._ghostVertex.addTo(this._map);
        },

        removeGhostVertex: function () {
            if (this._ghostVertex) {
                this._ghostVertex.remove();
                this._ghostVertex = null;
            }
            this._ghostLatLng = null;
            this.redrawPolygon();
        },

        onMouseMove: function (e) {
            if (this._isDragging) return;

            let snapped = this.snapLatLng(
                e.latlng,
                e.originalEvent.ctrlKey ? 0.25 : 1
            );

            let target = e.originalEvent?.target;

            if (target?.closest?.(".leaflet-marker-icon")) {
                this.removeGhostVertex();
                return;
            }

            this._ghostLatLng = snapped;

            if (!this._ghostVertex) {
                this.createGhostVertex();
            }

            this._ghostVertex.setLatLng(snapped);

            this.redrawPolygon();
        },

        onMouseOut: function () {
            this._ghostLatLng = null;
            this.removeGhostVertex();
            this.redrawPolygon();
        },

        getPreviewLatLngs: function () {
            let latlngs = this.vertices.map(v => v.getLatLng());

            if (
                !this._ghostLatLng ||
                !this._activeVertex ||
                this.vertices.length < 1
            ) {
                return latlngs;
            }

            let activeIndex =
                this.vertices.indexOf(this._activeVertex);

            if (activeIndex === -1) {
                return latlngs;
            }

            latlngs.splice(
                activeIndex + 1,
                0,
                this._ghostLatLng
            );

            return latlngs;
        },

        snapLatLng: function (latlng, step = 1) {
            let lat = Math.round(latlng.lat),
                lng = Math.round(latlng.lng);
            if (step < 1) {
                // always snap to an integer for one of the two axes
                if (Math.abs(latlng.lat - lat) < Math.abs(latlng.lng - lng)) {
                    // lat is closer to an edge than lng, so keep that snap to the grid and update fidelity of lng
                    lng = Math.round(latlng.lng / step) * step;
                } else {
                    lat = Math.round(latlng.lat / step) * step;
                }
            }
            return L.latLng(lat, lng);
        },

        addVertexFromClick: function (e) {
            if (this._ignoreVertexAdd) {
                this._ignoreVertexAdd = false;
                return;
            }

            let target = e.originalEvent?.target;

            if (!target) return;

            // Ignore Leaflet UI (controls, buttons, etc.)
            if (target.closest?.(".leaflet-control-container")) return;

            // Ignore clicks on markers (existing vertices)
            if (target.classList?.contains("leaflet-marker-icon")) return;

            // Only accept true map clicks
            if (!this._map || !this._map.getContainer().contains(target)) return;

            this.addVertex(e);
        },

        addVertex: function (e) {
            let latlng = e.latlng;

            let snapped = this.snapLatLng(
                latlng,
                e.originalEvent.ctrlKey ? 0.25 : 1
            );

            let v = this.createVertex(snapped, true);

            let insertIndex = this.vertices.length;

            if (this._activeVertex) {
                let activeIndex = this.vertices.indexOf(this._activeVertex);

                if (activeIndex !== -1) {
                    insertIndex = activeIndex + 1;
                }
            }

            this.vertices.splice(insertIndex, 0, v);

            this._activeVertex = v;

            this.refreshVertexStyles();

            v.addTo(this._map);

            this.redrawPolygon();
        },

        removeVertex: function (vertex) {
            let idx = this.vertices.indexOf(vertex);
            if (idx === -1) return;

            let latlng = this.vertices[idx]._latlng;

            vertex.remove();
            this.vertices.splice(idx, 1);

            let prevVertex = idx > 0 ? this.vertices[idx - 1] : this.vertices[this.vertices.length - 1];
            this._activeVertex = prevVertex;

            // create the ghost vertex in the place of the old vertex, since we're no longer hovering over an existing vertex now
            this.createGhostVertex();
            this._ghostVertex.setLatLng(latlng);
            this._ghostLatLng = latlng;

            this.refreshVertexStyles();
            this.redrawPolygon();
        },

        onVertexDrag: function (vertex, e) {
            let snapped = this.snapLatLng(vertex.getLatLng(), e.originalEvent.ctrlKey ? 0.25 : 1);

            vertex.setLatLng(snapped);

            this.redrawPolygon();
        },

        // -------------------------
        // Styling: last vertex active
        // -------------------------
        refreshVertexStyles: function () {
            this.vertices.forEach(v => {
                let isActive = (v === this._activeVertex);
                v.setActive?.(isActive);
            });
        },

        // -------------------------
        // Polygon update
        // -------------------------
        redrawPolygon: function () {
            let latlngs = this.getPreviewLatLngs();

            if (latlngs.length >= 2) {
                this.setLatLngs([latlngs]);
            } else if (latlngs.length == 1) {
                this.setLatLngs([latlngs[0], latlngs[0]])
            } else if (latlngs.length == 0 && this._path) {
                this.setLatLngs([L.GeoJSON.coordsToLatLng([0,0]), L.GeoJSON.coordsToLatLng([0,0])])
            }
            this.refreshVertexStyles();
        },

        // optional external setter
        setVertices: function (latlngs) {
            this.vertices.forEach(v => v.remove());
            this.vertices = [];

            latlngs.forEach(ll => {
                let v = this.createVertex(ll);
                this.vertices.push(v);
                v.addTo(this._map);
            });

            this.refreshVertexStyles();
            this.redrawPolygon();
        }
    });

    L.draggablePolygon = function (latlngs, options) {
        return new L.DraggablePolygon(latlngs, options);
    };

    // -------------------------
    // Control (simplified from rect)
    // -------------------------
    L.Control.Display.Polygon = L.Control.Display.extend({

        onAdd: function (map) {
            this.polygon = L.draggablePolygon([], { owner: this });
            console.log(this);
            this.oldPolygon = null;
            return L.Control.Display.prototype.onAdd.call(this, map);
        },

        options: {
            position: 'bottomleft',
            title: 'Create polygon',
            icon: 'images/Yellow_pentagon.png'
        },

        createInterface: function () {
            let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');

            let form = L.DomUtil.create('form', 'leaflet-control-display-form', container);
            let div = L.DomUtil.create('div', 'leaflet-control-display-info', form);
            div.innerHTML = 'Click to add vertices, hold ctrl for quarter-tile precision. Right-click a vertex to remove.'

            let copyArray = L.DomUtil.create('button', 'leaflet-control-display-submit copy-array', form);
            copyArray.addEventListener("click", this.copy.bind(this, 'array'));
            copyArray.textContent = "Copy polygon array";

            let copyWikitext = L.DomUtil.create('button', 'leaflet-control-display-submit copy-wikitext', form);
            copyWikitext.addEventListener("click", this.copy.bind(this, 'wikitext'));
            copyWikitext.textContent = "Copy Wikitext";

            let deleteVertices = L.DomUtil.create('button', 'leaflet-control-display-reset reset-polygon', form);
            deleteVertices.addEventListener("click", this.resetPolygon.bind(this));
            deleteVertices.textContent = "Delete all vertices";

            return container;
        },

        getCoordArray: function() {
            return this.polygon.vertices.map(v => {
                let ll = v.getLatLng();
                return [ll.lng, ll.lat];
            });
        },

        copy: function (copyType) {
            event.preventDefault();

            let arr = this.getCoordArray();
            if (arr.length < 1) return;

            let copystr = JSON.stringify(arr);
            if (copyType === 'wikitext') {
                copystr = '|' + this.getCoordArray().map(a => a.join(',')).join('|')
            }

            navigator.clipboard.writeText(copystr).then(() =>
                this._map.addMessage(`Copied polygon ${copyType} to clipboard`), () => console.error("Cannot copy text to clipboard"));

            return false;
        },

        resetPolygon: function () {
            event?.preventDefault();

            if (this.polygon.vertices.length == 0) {
                this._map.addMessage('No polygons to remove.');
                return false;
            }

            let msg = this._map.addMessage('All polygons have been deleted.');
            let a = L.DomUtil.create('a', 'leaflet-control-message-clear', msg);
            a.textContent = ' [Undo reset]';
            a.onclick = () => this.undoResetPolygon(msg);

            // preserve old polygon for being able to undo
            this.oldPolygon = this.polygon;
            this.polygon = L.draggablePolygon([], { owner: this });
            this.polygon.addTo(this._map);

            // this.onAdd();
            this.oldPolygon.remove();

            return false;
        },

        undoResetPolygon: function (msg) {
            event?.preventDefault();
            if (this.oldPolygon === null) return; // polygon was already reset

            this.polygon = this.oldPolygon;
            this.polygon.addTo(this._map);
            this.oldPolygon = null;

            this._map._messageContainer.removeChild(msg);

            return false;
        },

        expand: function () {
            this.polygon.addTo(this._map);
            return L.Control.Display.prototype.expand.call(this);
        },

        collapse: function () {
            this.polygon.remove();
            return L.Control.Display.prototype.collapse.call(this);
        }
    });

    L.control.display.polygon = function (options) {
        return new L.Control.Display.Polygon(options);
    };

    L.Map.addInitHook(function () {
        if (this.options.polygon) {
            this.polygon = L.control.display.polygon();
            this.addControl(this.polygon);
        }

    });
});