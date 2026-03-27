import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Clock, MapPin, ChevronRight, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility for Tailwind classes ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Fix for default marker icon in Leaflet + React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  currentWaitTime: number;
  historicalBaseline: number;
  approxPeopleCount: number;
  lastUpdated: string;
}

interface MapViewProps {
  locations: Location[];
  onSelectLocation: (location: Location) => void;
  center?: [number, number];
  zoom?: number;
  darkMode?: boolean;
}

// Component to handle map center updates
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export const MapView: React.FC<MapViewProps> = ({ 
  locations, 
  onSelectLocation,
  center = [37.7749, -122.4194], // Default to SF
  zoom = 13,
  darkMode = false
}) => {
  return (
    <div className={cn(
      "w-full h-[500px] rounded-2xl overflow-hidden border shadow-sm relative z-0 transition-colors duration-300",
      darkMode ? "border-stone-900" : "border-stone-200"
    )}>
      <MapContainer 
        center={center as [number, number]} 
        zoom={zoom} 
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <ChangeView center={center as [number, number]} zoom={zoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={darkMode 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />
        {locations.map((loc) => (
          <Marker 
            key={loc.id} 
            position={[loc.lat, loc.lng] as [number, number]}
          >
            <Popup className={cn("custom-popup", darkMode && "dark-popup")}>
              <div className={cn("p-1 space-y-3 min-w-[180px]", darkMode && "text-stone-100")}>
                <div className="space-y-1">
                  <div className={cn("flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest", darkMode ? "text-stone-500" : "text-stone-400")}>
                    <MapPin className="w-3 h-3" />
                    {loc.category}
                  </div>
                  <h3 className={cn("font-bold leading-tight", darkMode ? "text-stone-100" : "text-stone-900")}>{loc.name}</h3>
                </div>
                
                <div className={cn(
                  "flex items-center justify-between p-2 rounded-lg border transition-colors",
                  darkMode ? "bg-stone-900 border-stone-800" : "bg-stone-50 border-stone-100"
                )}>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Clock className={cn("w-3.5 h-3.5", darkMode ? "text-stone-500" : "text-stone-400")} />
                      <span className={cn("text-xs font-mono font-bold", darkMode ? "text-stone-100" : "text-stone-900")}>{loc.currentWaitTime}m</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className={cn("w-3.5 h-3.5", darkMode ? "text-stone-500" : "text-stone-400")} />
                      <span className={cn("text-[10px] font-bold uppercase tracking-tight", darkMode ? "text-stone-400" : "text-stone-500")}>~{loc.approxPeopleCount} people</span>
                    </div>
                  </div>
                  <div className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                    loc.currentWaitTime <= loc.historicalBaseline 
                      ? (darkMode ? "bg-green-900/30 text-green-400" : "bg-green-100 text-green-700") 
                      : (darkMode ? "bg-amber-900/30 text-amber-400" : "bg-amber-100 text-amber-700")
                  )}>
                    {loc.currentWaitTime <= loc.historicalBaseline ? 'Good' : 'Busy'}
                  </div>
                </div>

                <button 
                  onClick={() => onSelectLocation(loc)}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    darkMode ? "bg-stone-100 text-stone-900 hover:bg-stone-200" : "bg-stone-900 text-white hover:bg-stone-800"
                  )}
                >
                  View Details
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
