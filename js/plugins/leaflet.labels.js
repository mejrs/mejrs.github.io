

let label_path = "data/rs3/map_labels.json";
let label_locations_path = "data/rs3/map_label_locations.json";


function get_sprite_url(id){
	return `https://raw.githubusercontent.com/mejrs/Sprites/master/${id}-0.png`
}

function make_icon(loc){
	let url = loc?.iconSprite ?? loc?.sprite?.iconSprite;
	if (url === undefined){
		console.log("no sprite given for",loc);
	}
	let icon =  L.icon({
		iconUrl: get_sprite_url(url),
		//shadowUrl: get_sprite_url(loc.iconBackgroundSprite ?? loc.sprite.iconBackgroundSprite),
	});
	
	
	return icon
}

function plot_dungeon_icon(L, loc) {
    let item = L.marker([loc.location.y + 0.5, loc.location.x + 0.5], {icon: make_icon(loc)});
    let popUpText = Object.entries(loc).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
    item.bindPopup(popUpText, {
        autoPan: false
    });
    return item
}

function plot_icon(L, loc) {
    let item = L.marker([loc.location.y + 0.5, loc.location.x + 0.5], {icon: make_icon(loc)});
    let popUpText = Object.entries(loc).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
    item.bindPopup(popUpText, {
        autoPan: false
    });
    return item
}

function plot_text(L, loc) {
    let html = document.createElement('p');
    html.innerHTML = loc.text ?? loc?.sprite?.text;
    html.className = 'map-label-text';

    let[r, g, b] = loc.labelColor ?? [255, 255, 255];
    html.style.color = `rgb(${r},${g},${b})`;

    let divicon = L.divIcon({
        html: html,
        className: `map-label map-label-fontsize-${loc.fontSize}`
    });
    let item = L.marker([loc.location.y + 0.5, loc.location.x + 0.5], {
        icon: divicon,
        className: 'map-label-container'
    });
    let popUpText = Object.entries(loc).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
    item.bindPopup(popUpText, {
        autoPan: false
    });
    return item
}

function plot_polygon(L, loc) {
	let {plane, x, y} = loc.location;
	let latlngs = chunk(loc.polygon, 2).map(coord => L.latLng(y+coord[1], x + coord[0]));
	let item = L.polygon(latlngs);
    let popUpText = Object.entries(loc).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
    item.bindPopup(popUpText, {
        autoPan: false
    });
    return item
	
}

const chunk = (arr, size) =>  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );


function plot(L, loc, labels) {
    Object.assign(loc, labels[loc.labelId]);

    if (loc.category === 949 || loc.category === 948) {
        return plot_dungeon_icon(L, loc)
    }else if ('text' in loc || loc.category === 950 || loc?.sprite?.text) {
        return plot_text(L, loc)
    } else if ('polygon' in loc) {
        return plot_polygon(L, loc)
    } else{
		return plot_icon(L, loc)
    }
}

function int_to_coordinate(integer){
    let p = integer >> 28;
    let x = (integer >> 14) & 0x3FFF;
    let y = integer & 0x3FFF;
    return {plane:p, x:x, y:y}
}

export default async function (L, map) {

    // convert into dictionary; slots are sometimes empty
    let label_promise = fetch(label_path).then(res => res.json()).then(res => res.reduce((acc, item) => Object.assign(acc, {
                    [item.id]: item
                }), {}));

    let locations_promise = fetch(label_locations_path).then(res => res.json());

    let[labels, locations] = await Promise.all([label_promise, locations_promise]);

    // resolve recursive labels
    for (const[_, label]of Object.entries(labels)) {
        let sprite_label = label?.legacySwitch?.index;
        if (sprite_label !== undefined) {
            label.sprite = labels[sprite_label];
        }

        let legacy_sprite_label = label?.legacySwitch?.legacyIndex;
        if (legacy_sprite_label !== undefined) {
            label.legacy_sprite = labels[legacy_sprite_label];
        }
    }

    locations.forEach(loc => plot(L, loc, labels).addTo(map));
}
