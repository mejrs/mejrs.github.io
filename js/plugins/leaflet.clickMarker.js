var clickMarkers = L.control.layers({}, {}, {
        "collapsed": false,
        'position': 'topleft'
    });

L.Control.Objects = L.Control.extend({
        options: {},

        onAdd: function (map) {
            this._map = map;
            this._container = L.DomUtil.create('div');
            this._map.on("dblclick", this.plantMarker, this);
            return this._container;
        },

        onRemove: function (map) {},
        convert: function (_plane, _globalX, _globalY) {
            return {
                plane: _plane,
                i: _globalX >> 6,
                j: _globalY >> 6,
                x: _globalX & 0x3F,
                y: _globalY & 0x3F,
            }
        },

        deConvert: function (_plane, _i, _j, _x, _y) {
            return {
                plane: _plane,
                globalX: 64 * _i + _x,
                globalX: 64 * _j + _y
            }
        },
		
        parseContent: function (obj) {
            var objText = "";
            for (var[key, value]of Object.entries(obj)) {
                if (key === "o") {
                    objText += "origin" + " = " + obj.o.p + "_" + obj.o.i + "_" + obj.o.j + "_" + obj.o.x + "_" + obj.o.y + "<br>";
                } else {
                    objText += key + " = " + JSON.stringify(value) + "<br>";
                }
            }
            return objText
        },
		
        plantMarker: function (e) {
			if (this._map.getMapId() !== -1){return}
            let coords = this.convert(this._map.getPlane(), e.latlng.lng, e.latlng.lat);
            let marker_latlng = [64 * coords.j + coords.y + 0.5, 64 * coords.i + coords.x + 0.5];
            fetch("../mejrs.github.io/chunks/" + coords.i + "_" + coords.j + ".json").then(response => response.json()).then(data => {
                var coord = JSON.stringify({
                        "p": coords.plane,
                        "i": coords.i,
                        "j": coords.j,
                        "x": coords.x,
                        "y": coords.y
                    });
					
                var markerContent = new Array();
                for (var element of data) {
                    if (JSON.stringify(element.o) == coord) {
                        markerContent.push(element);
                    }
                }

                switch (markerContent.length) {
                case 0:
                    return;
                case 1:
                    var marker = L.marker(marker_latlng);
                    var popUpText = this.parseContent(markerContent[0]);
                    marker.bindPopup(popUpText);
                    break;
                default:
                    var marker = L.marker(marker_latlng);
                    var tabContent = '<div class="tabs">';
                    var ulContent = '<ul class="tabs-link">';
                    for (var content of markerContent) {
                        var tabId = content.name ? content.name : content.id;
                        tabContent += '<div class="tab" id="' + tabId + '"><div class="content">';
                        ulContent += '<li class="tab-link"> <a href="#' + tabId + '"><span>' + tabId + '</span></a></li>';
                        tabContent += this.parseContent(content)
                        tabContent += '</div></div>';
                    }
                    ulContent += '</ul></div>';
                    var popUpText = tabContent + ulContent;
                    marker.bindPopup(popUpText);
                    break;
                }
                marker.addTo(runescape_map);
                clickMarkers.addOverlay(marker, coords.plane + "_" + coords.i + "_" + coords.j + "_" + coords.x + "_" + coords.y).addTo(runescape_map);

            });
        },
    });

L.control.objects = function (options) {
    return new L.Control.Objects(options);
};
