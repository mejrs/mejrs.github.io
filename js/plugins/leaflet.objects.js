'use strict';

import "../leaflet.js";
import "../layers.js";

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

    L.Objects = L.DynamicIcons.extend({
        onAdd: function (map) { // eslint-disable-line no-unused-vars
            if (this.options.names || this.options.ids) {

                this.getData(this.options.names, this.options.ids)
                .then(locations => {
                    this._icon_data = this.parseData(locations);
                    this._icons = {};
                    this._resetView();
                    this._update();
                }).catch(console.error);
            } else {
                throw new Error("No objects specified");
            }
        },

        getData: async function (names, ids) {

            if (names && names.length !== 0) {
                let name_mapping_promise = fetch(`${this.options.folder}/object_name_collection.json`).then(res => res.json(), _ => {throw new Error(`Unable to fetch ${this.options.folder}/object_name_collection.json`)});
                let morph_mapping_promise = fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json(),  _ => {throw new Error(`Unable to fetch ${this.options.folder}/object_morph_collection.json`)});
                let[name_mapping, morph_mapping] = await Promise.all([name_mapping_promise, morph_mapping_promise]);

                let ids = names.flatMap(name => name_mapping[name] ?? []);

                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));

                let all_locations = await Promise.allSettled(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`)))
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else if (ids && ids.length !== 0) {
                let morph_mapping = await fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json());
                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));
                let all_locations = await Promise.allSettled(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`)))
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else {
                throw new Error("")
            }
        },

        parseData: function (data) {
            let icon_data = {};

            data.forEach(item => {
                let key = this._tileCoordsToKey({
                    plane: item.plane,
                    x: (item.i),
                    y:  - (item.j)
                });

                if (!(key in icon_data)) {
                    icon_data[key] = [];
                }
                icon_data[key].push(item);
            });

            let reallyLoadEverything = data.length < 10000 ? true : confirm(`Really load ${data.length} markers?`);
            if (reallyLoadEverything) {
                this._map.addMessage(`Found ${data.length} locations of this object.`);
                return icon_data;
            } else {
                return []
            }
        },

        createIcon: function (item) {
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([((item.j << 6) + item.y + 0.5), ((item.i << 6) + item.x + 0.5)], {
                icon: item.plane === this._map.getPlane() ? icon : greyscaleIcon,
            });

            this._map.on('planechange', function (e) {
                marker.setIcon(item.plane === e.newPlane ? icon : greyscaleIcon);
            });
            let textContainer = document.createElement('div');
            let imgContainer = document.createElement('div');
            imgContainer.setAttribute('class', 'object-image-container');
            let container = document.createElement('div');
            container.appendChild(imgContainer);
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false
            });

            let as_text = i => typeof i !== "string" ? JSON.stringify(i) : i;

            marker.once('popupopen', async() => {
                let data = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(res => res.json());
                let textfield = "";
                if (data.name !== undefined) {
                    // put name first
                    textfield += `name = ${data.name}<br>`;
                }
                textfield += `plane = ${item.plane}<br>`;
                textfield += `x = ${(item.i << 6) + item.x}<br>`;
                textfield += `y = ${(item.j << 6) + item.y}<br>`;
                textfield += `id = ${item.id}<br>`;
                textfield += `type = ${item.type}<br>`;
                textfield += `rotation = ${item.rotation}<br>`;

                for (const[key, value]of Object.entries(data)) {
                    if (key !== "name") {
                        textfield += `${key} = ${as_text(value)}<br>`;
                    }
                }

                textContainer.innerHTML = textfield;

            });

            return marker
        },
    });

    L.objects = function (options) {
        return new L.Objects(options);
    }

    L.Objects.OSRS = L.Objects.extend({
		createChiselIcon: function (item) {
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([item.location.y + 0.5, item.location.x + 0.5], {
                icon: item.location.plane === this._map.getPlane() ? icon : greyscaleIcon
            });
			marker.options.icon.options.className = "huechange";
			
			

            this._map.on('planechange', function (e) {
                marker.setIcon(item.location.plane === e.newPlane ? icon : greyscaleIcon);
            });
			let crowdsourcedescription = document.createElement('div');
			crowdsourcedescription.innerHTML = "This object's location was gathered with the Runescape Wiki crowdsource project. See <a href='https://oldschool.runescape.wiki/w/RuneScape:Crowdsourcing#Object_locations'>here</a> for more information.";
            let textContainer = document.createElement('div');
            let imgContainer = document.createElement('div');
            imgContainer.setAttribute('class', 'object-image-container');
            let container = document.createElement('div');
			container.appendChild(crowdsourcedescription);
            container.appendChild(imgContainer);
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false
            });

            let as_text = i => typeof i !== "string" ? JSON.stringify(i) : i;

            marker.once('popupopen', async() => {
                let location_config = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(res => res.json());

                let textfield = "";
                if (location_config.name !== undefined) {
                    // put name first
                    textfield += `name = ${location_config.name}<br>`;
                }
                textfield += `plane = ${item.location.plane}<br>`;
                textfield += `x = ${item.location.x}<br>`;
                textfield += `y = ${item.location.y}<br>`;
				textfield += `label = ${item.label}<br>`;

                for (const[key, value]of Object.entries(location_config)) {
                    if (key !== "name") {
                        textfield += `${key} = ${as_text(value)}<br>`;
                    }
                }

                textContainer.innerHTML = textfield;
                this.createModelTab(item, location_config).then(img => imgContainer.appendChild(img))

            });

            return marker
        },

        createIcon: function (item) {
            if ("location" in item) {
                return this.createChiselIcon(item)
            }
            let icon = L.icon({
                iconUrl: 'images/marker-icon.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });
            let greyscaleIcon = L.icon({
                iconUrl: 'images/marker-icon-greyscale.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                tooltipAnchor: [16, -28],
                shadowSize: [41, 41]
            });

            let marker = L.marker([((item.j << 6) + item.y + 0.5), ((item.i << 6) + item.x + 0.5)], {
                icon: item.plane === this._map.getPlane() ? icon : greyscaleIcon,
            });

            this._map.on('planechange', function (e) {
                marker.setIcon(item.plane === e.newPlane ? icon : greyscaleIcon);
            });
            let textContainer = document.createElement('div');
            let imgContainer = document.createElement('div');
            imgContainer.setAttribute('class', 'object-image-container');
            let container = document.createElement('div');
            container.appendChild(imgContainer);
            container.appendChild(textContainer);

            marker.bindPopup(container, {
                autoPan: false
            });

            let as_text = i => typeof i !== "string" ? JSON.stringify(i) : i;

            marker.once('popupopen', async() => {
                let location_config = await fetch(`${this.options.folder}/location_configs/${item.id}.json`).then(res => res.json());

                let textfield = "";
                if (location_config.name !== undefined) {
                    // put name first
                    textfield += `name = ${location_config.name}<br>`;
                }
                textfield += `plane = ${item.plane}<br>`;
                textfield += `x = ${(item.i << 6) + item.x}<br>`;
                textfield += `y = ${(item.j << 6) + item.y}<br>`;
                textfield += `id = ${item.id}<br>`;
                textfield += `type = ${item.type}<br>`;
                textfield += `rotation = ${item.rotation}<br>`;

                for (const[key, value]of Object.entries(location_config)) {
                    if (key !== "name") {
                        textfield += `${key} = ${as_text(value)}<br>`;
                    }
                }

                textContainer.innerHTML = textfield;
                this.createModelTab(item, location_config).then(img => imgContainer.appendChild(img))

            });

            return marker
        },

        getData: async function (names, ids) {

            if (names && names.length !== 0) {
                let name_mapping_promise = fetch(`${this.options.folder}/object_name_collection.json`).then(res => res.json());
                let morph_mapping_promise = fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json());
                let[name_mapping, morph_mapping] = await Promise.all([name_mapping_promise, morph_mapping_promise]);

                let ids = names.flatMap(name => name_mapping[name] ?? []);

                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));

                let all_locations = await Promise.allSettled([...(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`))), ...(all_ids.map(id => fetch(`https://chisel.weirdgloop.org/scenery/server_mapdata?id=${id}`)))])
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else if (ids && ids.length !== 0) {
                let morph_mapping = await fetch(`${this.options.folder}/object_morph_collection.json`).then(res => res.json());
                let all_ids = Array.from(new Set(ids.flatMap(id => [...(morph_mapping[id] ?? []), id])));

                let all_locations = await Promise.allSettled([...(all_ids.map(id => fetch(`${this.options.folder}/locations/${id}.json`))), ...(all_ids.map(id => fetch(`https://chisel.weirdgloop.org/scenery/server_mapdata?id=${id}`)))])
                    .then(responses => Promise.all(responses.filter(res => res.status === "fulfilled" && res.value.ok).map(res => res.value.json())));

                return all_locations.flat();
            } else {
                throw new Error("")
            }
        },

        parseData: function (data) {
            let icon_data = {};

            data.forEach(item => {
                let key = this._tileCoordsToKey({
                    plane: item.plane ?? item.location.plane,
                    x: (item.i ?? (item.location.x >> 6)),
                    y:  - (item.j ?? (item.location.y >> 6))
                });

                if (!(key in icon_data)) {
                    icon_data[key] = [];
                }
                icon_data[key].push(item);
            });

            let reallyLoadEverything = data.length < 10000 ? true : confirm(`Really load ${data.length} markers?`);
            if (reallyLoadEverything) {
                this._map.addMessage(`Found ${data.length} locations of this object.`);
                return icon_data;
            } else {
                return []
            }
        },

        createModelTab: async function (loc, location_config) {
            function getImage(id) {
                return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
                    if (id === -1) {
                        reject();
                    }
                    let img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject();
                    let rotation = loc.rotation ?? 0;
                    img.src = `https://chisel.weirdgloop.org/static/img/osrs-object/${id}_orient${rotation}.png`;
                })
            }
            let ids = Array.from(new Set([location_config.id, ...(location_config.morphs ?? []), ...(location_config.morphs_2 ?? [])]));
            ids.sort();

            let imgs = await Promise.allSettled(ids.map(getImage));

            if (imgs.length === 1 && imgs[0].status === 'fulfilled') {
                let img = imgs[0].value
                    img.setAttribute('class', 'object-image');
                return img
            } else if (imgs.some(img => img.status === 'fulfilled')) {
                let tabs = document.createElement('div');
                tabs.setAttribute('class', 'tabs');

                let content = document.createElement('div');
                content.setAttribute('class', 'content');

                imgs.forEach((img_promise, i) => {
                    if (img_promise.status === 'fulfilled' && (img_promise.value.width > 1 || img_promise.value.height > 1)) {
                        if (!(content.innerHTML)) {
                            let img = img_promise.value;
                            img.setAttribute('class', 'object-image');
                            content.appendChild(img);
                        }

                        let button = document.createElement('div');
                        button.innerHTML = ids[i];
                        button.addEventListener('click', () => {
                            content.innerHTML = '';
                            let img = img_promise.value;
                            img.setAttribute('class', 'object-image');
                            content.appendChild(img);
                        });
                        button.setAttribute('class', 'tabbutton');
                        tabs.appendChild(button);
                    }
                });
                let combined = document.createElement('div');
                combined.appendChild(tabs);
                combined.appendChild(content);
                return combined

            } else {
                return document.createElement('div');
            }

        }

    });

    L.objects.osrs = function (options) {
        return new L.Objects.OSRS(options);
    }
});
