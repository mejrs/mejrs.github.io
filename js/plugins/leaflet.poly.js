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

        onDrag: function () {
            this.options.owner.onVertexDrag(this);
        },

        onDragEnd: function () {
            let owner = this.options.owner;
            owner.update();
            owner._isDragging = false;
            // ignore vertex add through click events, because this next click event is fired from a drag
            owner._ignoreVertexAdd = true;
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
            if (!this._activeVertex) return;
            if (this._isDragging) return;
            if (this.vertices.length < 2) return;

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
                this.vertices.length < 2
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

            this.update();
        },

        removeVertex: function (vertex) {
            let idx = this.vertices.indexOf(vertex);
            if (idx === -1) return;

            vertex.remove();
            this.vertices.splice(idx, 1);

            this.refreshVertexStyles();
            this.update();
        },

        onVertexDrag: function (vertex) {
            let snapped = this.snapLatLng(vertex.getLatLng(), 0.25);

            vertex.setLatLng(snapped);

            this.update();
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
        update: function () {
            this.redrawPolygon();

            if (this.options.owner) {
                this.options.owner.update(this.getLatLngs()[0] || []);
            }
        },

        redrawPolygon: function () {
            let latlngs = this.getPreviewLatLngs();

            if (latlngs.length >= 2) {
                this.setLatLngs([latlngs]);
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
            this.update();
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
            return L.Control.Display.prototype.onAdd.call(this, map);
        },

        options: {
            position: 'bottomleft',
            title: 'Polygon:',
            icon: 'images/Blue_square_(Prisoner_of_Glouphrie).png'
        },

        createInterface: function () {
            let container = L.DomUtil.create('div', 'leaflet-control-display-expanded');
            let form = L.DomUtil.create('form', 'leaflet-control-display-form', container);

            this.count = L.DomUtil.create('input', '', form);
            this.count.readOnly = true;

            return container;
        },

        update: function (latlngs) {
            this.count.value = latlngs.length;
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