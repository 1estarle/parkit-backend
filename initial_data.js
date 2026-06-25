const spots = [
    {
        id: "spot_001",
        title: "Parking Centro Ñuñoa",
        address: "Av. Ñuñoa 1200, Ñuñoa",
        commune: "Ñuñoa",
        latitude: -33.4169,
        longitude: -70.5816,
        pricePerMinute: 500,
        rating: 4.8,
        reviews: 245,
        images: ["https://images.unsplash.com/photo-1506521295926-19cd7c91ae56?w=500"],
        amenities: ["WiFi", "Cámara 24/7", "Seguridad"],
        description: "Estacionamiento moderno en el corazón de Ñuñoa.",
        availability: true
    },
    {
        id: "spot_002",
        title: "Parking Providencia Mall",
        address: "Av. Providencia 2100, Providencia",
        commune: "Providencia",
        latitude: -33.4285,
        longitude: -70.5895,
        pricePerMinute: 750,
        rating: 4.6,
        reviews: 189,
        images: ["https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?w=500"],
        amenities: ["Vigilancia", "Ascensor"],
        description: "Centro comercial de primer nivel con seguridad.",
        availability: true
    }
];

module.exports = { spots };
