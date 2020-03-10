"use strict";

function detectNewHeader(row, previousRow) {

    if (typeof previousRow !== undefined && previousRow.length === 0) {
        if (typeof row !== undefined && row.length > 1) {
            return true;
        }

    }
    return false;
}

function parseSheet(sheet) {
    let keys;
    let groupName;

    let group = [];
    sheet.forEach((row, rowNumber, array) => {

        let previousRow = array[rowNumber - 1] ?? [];

        if (detectNewHeader(row, previousRow)) {

            keys = row;

            groupName = row[0];
            row[0] = "name";
            let newGroup = {
                rowNumber: rowNumber,
                groupName: groupName,
                items: []
            };
            group.push(newGroup);

            return;

        }
        if (groupName && row.length !== 0) {

            let item = {};
            item.rowNumber = rowNumber + 1; //starting at 1
            item.groupName = groupName
                keys.forEach((key, colNumber) => {
                    item[key] = row[colNumber];
                });
            group[group.length - 1].items.push(item);

        }

    });

    return group;

}

function parseItems(group) {
    //console.log(group);
    group.items = group.items.map(item => {
            try {
                if (item["start (plane x y)"]) {
                        let[p1, x1, y1] = item["start (plane x y)"].match(/\d+/g).map(Number);
                        item.destination = {
                            plane: p1,
                            x: x1,
                            y: y1
                        };
                    }

                    let[p2, x2, y2] = item["end (plane x y)"].match(/\d+/g).map(Number);

                    item.start = {
                        plane: p2,
                        x: x2,
                        y: y2
                    };
                }
                catch {
                    throw new Error(JSON.stringify(item));
                }

                return item
            });

            return group;

        }

            function parseCoord(coord) {

            try {
                var[p, x, y] = look.match(/\d+/g).map(Number);
            } catch (error) {
                throw new Error("error parsing", item);

            };

            let destination = {
                plane: p,
                x: x,
                y: y
            }
            return destination;
        }

            function createTeleports(map, collection) {
            const bounds = map.options.maxBounds;
            var teleportControl = L.control.layers({}, {}, {
                    "collapsed": true,
                    "position": 'topleft'
                });

            const currentPlane = map.getPlane();

            let markers = collection.forEach(group => {
                    let teleports = L.layerGroup();

                    group.items.forEach(item => {
                        let icon = L.icon({
                                iconUrl: '../mejrs.github.io/images/marker-icon.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                tooltipAnchor: [16, -28],
                                shadowSize: [41, 41]
                            });
                        let greyscaleIcon = L.icon({
                                iconUrl: '../mejrs.github.io/images/marker-icon-greyscale.png',
                                iconSize: [25, 41],
                                iconAnchor: [12, 41],
                                popupAnchor: [1, -34],
                                tooltipAnchor: [16, -28],
                                shadowSize: [41, 41]
                            });

                        if (item && item.destination) {
                            if (!bounds.contains([item.destination.y, item.destination.x])) {
                                console.log("Bounds error", item);
                            }
                            let destinationMarker = L.marker([(item.destination.y + 0.5), (item.destination.x + 0.5)], {
                                    icon: item.destination.plane === currentPlane ? icon : greyscaleIcon,
                                });
                            let popUpBody = createPopupBody("destination", map, item);

                            destinationMarker.bindPopup(popUpBody);
                            destinationMarker.on('click', function (e) {
                                this.openPopup();
                            });

                            map.on('planechange', function (e) {
                                destinationMarker.setIcon(item.destination.plane === e.newPlane ? icon : greyscaleIcon);
                            });

                            teleports.addLayer(destinationMarker);
                        }

                        if (item && item.start) {
                            if (!bounds.contains([item.start.y, item.start.x])) {
                                console.log("Bounds error", item);
                            }
                            let startMarker = L.marker([(item.start.y + 0.5), (item.start.x + 0.5)], {
                                    icon: item.start.plane === currentPlane ? icon : greyscaleIcon,
                                });

                            let popUpBody = createPopupBody("start", map, item);

                            startMarker.bindPopup(popUpBody);
                            startMarker.on('click', function (e) {
                                this.openPopup();
                            });

                            map.on('planechange', function (e) {
                                startMarker.setIcon(item.start.plane === e.newPlane ? icon : greyscaleIcon);
                            });

                            teleports.addLayer(startMarker);
                        }

                        if (item && item.start && item.destination) {
                            let points = [[(item.start.y + 0.5), (item.start.x + 0.5)], [(item.destination.y + 0.5), (item.destination.x + 0.5)]];
                            let travel = L.polyline(points, {
                                    color: item.start.plane === item.destination.plane ? '#3388FF' : 'grey'
                                });
                            teleports.addLayer(travel);
                        }
                    })
                   
                    teleportControl.addOverlay(teleports, group.groupName);

                    return teleports
                })
                teleportControl.addTo(map);
        }

            function createPopupBody(mode, map, item) {
            let wrapper = document.createElement('div');

            let nav = (item.start && item.destination) ? createNavigator(mode, map, item) : document.createElement('div');

            let info = document.createElement('div');
            info.innerHTML = Object.entries(item).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");

            wrapper.appendChild(nav);
            wrapper.appendChild(info);
            return wrapper;
        }

            function createNavigator(mode, map, item) {

            let newButton = document.createElement("button");
            newButton.innerHTML = "Navigate to link";
            newButton.onclick = function () {
                switch (mode) {
                case 'start':
                    var {
                        plane,
                        x,
                        y
                    } = item.destination;
                    break;
                case 'destination':
                    var {
                        plane,
                        x,
                        y
                    } = item.start;
                    break;
                default:
                    throw mode + " is not an expected value!";
                    break;
                }
                console.log("navigating to", plane, x, y);
                map.setPlane(plane);
                map.flyTo([y, x], 3, {
                    duration: 3
                })
            };
            return newButton;
        }

            const API_KEY = "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8";

            const SHEET_ID = "15ARRFqUZRtotJEdPVpmw30-u7_EowQ_L3fyHaJwauS0";

            var dataPromise = fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:Z?key=${API_KEY}`);

            dataPromise.then(response => response.json()).then(data => {
                let sheet = parseSheet(data.values);

                console.log("sheet=", sheet);
                let collection = sheet.map(parseItems);

                console.log("parsed items", collection);
                createTeleports(runescape_map, collection);

            });
