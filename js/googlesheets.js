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

            //console.log(rowNumber,keys);

            return;

        }
        if (groupName && row.length !== 0) {

            let item = {};
            item.rowNumber = rowNumber + 1;//starting at 1
            item.groupName = groupName
                keys.forEach((key, colNumber) => {
                    item[key] = row[colNumber];
                })
                group[group.length - 1].items.push(item);
            //console.log(rowNumber,row);
        }

        //console.log(name, keys);

    });
    return group;

}

function parseItems(group) {
    //console.log(group);
    group.items = group.items.map(item => {
            let endPos = item["Pos (End)"] ?? item["Pos"];
            let endLook = item["Look (End)"] ?? item["Look"];
            if (!endPos || !endLook) {
                return
            }
            let destination = parseCoord(endPos, endLook);
            item.destination = destination;

            let startPos = item["Pos (Start)"] ?? item["Pos"];
            let startLook = item["Look (Start)"] ?? item["Look"];
            if (startPos && startLook && startPos !== "-" && startLook !== "-" && (startPos !== endPos || startLook !== endLook)) {
                let start = parseCoord(startPos, startLook);
                item.start = start;
            }

            return item
        });

    return group;

}

function parseCoord(pos, look) {

    let _plane = Number(pos);
    let[, _i, _j, _x, _y] = look.match(/\d+/g).map(Number);

    let destination = {
        plane: _plane,
        x: _i << 6 | _x,
        y: _j << 6 | _y
    }
    return destination;
}

function createTeleports(map, collection) {
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
                    let destinationMarker = L.marker([(item.destination.y + 0.5), (item.destination.x + 0.5)], {
                            icon: item.destination.plane === currentPlane ? icon : greyscaleIcon,
                        });
                    let popUpText = Object.entries(item).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");

                    destinationMarker.bindPopup(popUpText);
                    destinationMarker.on('click', function (e) {
                        this.openPopup();
                    });

                    map.on('planechange', function (e) {
                        destinationMarker.setIcon(item.destination.plane === e.newPlane ? icon : greyscaleIcon);
                    });

                    teleports.addLayer(destinationMarker);
                }
				
				if (item && item.start) {
                    let startMarker = L.marker([(item.start.y + 0.5), (item.start.x + 0.5)], {
                            icon: item.start.plane === currentPlane ? icon : greyscaleIcon,
                        });
                    let popUpText = Object.entries(item).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");

                    startMarker.bindPopup(popUpText);
                    startMarker.on('click', function (e) {
                        this.openPopup();
                    });

                    map.on('planechange', function (e) {
                        startMarker.setIcon(item.start.plane === e.newPlane ? icon : greyscaleIcon);
                    });

                    teleports.addLayer(startMarker);
                }
				
				if (item && item.start && item.destination){
					let points = [[(item.start.y + 0.5), (item.start.x + 0.5)],[(item.destination.y + 0.5), (item.destination.x + 0.5)]];
					let travel = L.polyline(points,{color: item.start.plane === item.destination.plane ? '#3388FF':'grey'});
					teleports.addLayer(travel);
				}
            })
            teleports.addTo(map);
            teleportControl.addOverlay(teleports, group.groupName);

            return teleports
        })
        teleportControl.addTo(map);
}

const API_KEY = "AIzaSyBrYT0-aS9VpW2Aenm-pJ2UCUhih8cZ4g8";

const SHEET_ID = "16h4qJwfHFd7aBtrE4hEqRl1w23WOlQgsnijx5-_lBgs";

var dataPromise = fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:Z?key=${API_KEY}`);

dataPromise.then(response => response.json()).then(data => {

    let collection = parseSheet(data.values).map(parseItems);
    console.log(collection);

    createTeleports(runescape_map, collection);

});
