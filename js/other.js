

function show_data(map, path, fn = (i) => i) {

    var markerPromise = fetch(path);
    const currentPlane = map.getPlane();
    markerPromise.then(response => response.json()).then(data => fn(data)).then(data => {
        var markerCollection = L.layerGroup();

        data.forEach(item => {

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

            let marker = L.marker([(item.y + 0.5), (item.x + 0.5)], {
                    icon: item.p === currentPlane ? icon : greyscaleIcon,
                });

            map.on('planechange', function (e) {
                marker.setIcon(item.p === e.newPlane ? icon : greyscaleIcon);
            });

            let popUpText = Object.entries(item).map(x => x.map(i => typeof i !== "string" ? JSON.stringify(i) : i).join(" = ")).join("<br>");
            marker.bindPopup(popUpText)
            markerCollection.addLayer(marker)

        });

        markerCollection.addTo(map);

        return;
    });

    markerPromise.catch(function (resolve, reject) {
        return 0;
    });

}
