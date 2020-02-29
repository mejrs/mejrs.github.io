

function loadAllIcons(){
	const mapData = "original_sprite_locations.json"
	const dataPromise = fetch(mapData);
	var maplinks = L.layerGroup();
	var unids = L.layerGroup();
	const links = [949,1206,1217];
	
    dataPromise.then(response => response.json()).then(data => {
		 data.forEach(item => {
			

			if (item.type === "maplink"){
				loadMaplink(item).addTo(maplinks);
			}
			else if(links.includes(item.iconData.properties.unk_19) &&(item.type === "icon" || item.type === "object")){
				loadIcon(item).addTo(unids);
				console.log(".");
			}
		});
	});

	unids.addTo(runescape_map);
	
	L.control.layers({}, {
	    show_maplinks: maplinks,
    show_to_do: unids,
 
}, {
    collapsed: false,
    position: 'bottomright'
}).addTo(runescape_map);
}


function loadIcon(item) {
	const privatelink = "../mejrs.github.io/";
    var iconSprite = item.iconData.icon.iconSprite;
    var iconClass = item.iconData.properties.unk_19;

    if (iconSprite == 32768) {
        iconSprite = 33478;
    }

    var marker_icon = L.divIcon({
            html: '<div class="map-icon plane-' + item.plane + ' icon-class-' + iconClass + '"><img src="' + privatelink + 'layers/sprites/' + iconSprite + '-0.png" alt="' + iconSprite + '"></div>',
            iconSize: null //default marker is a 12x12 white box, this makes it not appear
        });

    let marker = L.marker([item.y, item.x], {
            icon: marker_icon,
            alt: iconSprite + '-0.png',
            riseOnHover: true,
        });

    if ("tooltip" in item) {
        marker.bindTooltip(item.tooltip, {
            direction: "top",
            offset: [12, -20]
        })

    }

    if ("dungeonSprite" in item.iconData.icon) {
        var mouseoverIconSprite = item.iconData.icon.dungeonSprite;
        var mouseover_marker_icon = L.icon({
                iconUrl:  privatelink + 'layers/sprites/' + mouseoverIconSprite + '-0.png',
                iconSize: null,
                classname: 'map-icon plane-' + item.plane + ' icon-class-' + iconClass,
            });

        marker.once('mouseover', function () {
            console.log(JSON.stringify(item));
            this.setIcon(mouseover_marker_icon);
        });

        marker.on('mouseout', function () {
            this.setIcon(marker_icon);

            //Has to be done this way (I think) to prevent mouseover event from firing continuously
            marker.once('mouseover', function () {
                console.log(item);
                this.setIcon(mouseover_marker_icon);
            });
        });
    } else {
        marker.on('mouseover', function (e) {
            console.log(JSON.stringify(item));
        });
    }

    return marker;
}

function loadTextLabel(item) {
    var label_text = item.iconData.icon.text;
    var label_fontSize = item.iconData.icon.fontSize;
    var label_color = item.iconData.icon.labelColor;

    marker_icon = L.divIcon({
            html: '<div style="color:rgb(' + label_color + ');" class="map-label text-label-' + label_fontSize + '">' + label_text + '</div>',
            iconSize: null, //with css width:max-content rule, makes text not wrap NOTE: this isn't 'officially' supported
        });
    var marker = L.marker([item.y, item.x], {
            icon: marker_icon
        });

    map.on('pan_to_' + label_text, function () {
        console.log("panning to" + label_text);
        var label_location = marker.getLatLng();
        map.setView(label_location, 2);

    });

    return marker;
}

function loadMaplink(item) {
	const privatelink = "../mejrs.github.io/";
    var iconSprite = item.iconData.icon.iconSprite;
    var iconClass = item.iconData.properties.unk_19;

    if (iconSprite == 32768) {
        iconSprite = 33478;
    }

    var marker_icon = L.divIcon({
            html: '<div class="map-icon plane-' + item.plane + ' icon-class-' + iconClass + '"><img src="' + privatelink + 'layers/sprites/' + iconSprite + '-0.png" alt="' + iconSprite + '"></div>',
            iconSize: null //default marker is a 12x12 white box, this makes it not appear
        });

    let marker = L.marker([item.y, item.x], {
            icon: marker_icon,
            alt: iconSprite,
            riseOnHover: true,
        });

    if ("tooltip" in item) {
        marker.bindTooltip(item.tooltip, {
            direction: "top",
            offset: [12, -20]
        })

    }

    if ("dungeonSprite" in item.iconData.icon) {
        var mouseoverIconSprite = item.iconData.icon.dungeonSprite;
        var mouseover_marker_icon = L.divIcon({
                html: '<div class="map-icon plane-' + item.plane + ' icon-class-' + iconClass + '"><img src="' + privatelink + 'layers/sprites/' + mouseoverIconSprite + '-0.png" alt="' + mouseoverIconSprite + '"></div>',
                iconSize: null //default marker is a 12x12 white box, this makes it not appear
            });

        marker.once('mouseover', function () {
            console.log(JSON.stringify(item));
            this.setIcon(mouseover_marker_icon);
        });

        marker.on('mouseout', function () {
            this.setIcon(marker_icon);

            //Has to be done this way (I think) to prevent mouseover event from firing continuously
            marker.once('mouseover', function () {
                console.log(JSON.stringify(item));
                this.setIcon(mouseover_marker_icon);
            });
        });
    } else {
        marker.on('mouseover', function (e) {
            console.log(JSON.stringify(item));
        });
    }

    marker.on('click', function (e) {
		let destination = item.iconData.properties.unk_249["4148"];
        let x = (destination >> 14) & 0x3FFF;
		let y = destination & 0x3FFF;
		runescape_map.flyTo([y,x],2)
    })

    return marker;
}

function loadUnknown(item) {}
