import {
  AfterContentInit,
  Directive,
  EventEmitter,
  Host,
  Inject,
  Input,
  NgZone,
  OnChanges,
  Optional,
  Output,
  SimpleChanges,
} from '@angular/core';
import MapboxGeocoder, {
  Result,
  Results,
  LngLatLiteral,
  GeocoderOptions,
} from '@mapbox/mapbox-gl-geocoder';
import {
  MapService,
  deprecationWarning,
  ControlComponent,
  MAPBOX_GEOCODER_API_KEY,
} from 'ngx-mapbox-gl';
import { Map, Marker } from 'mapbox-gl';

export { Result, Results } from '@mapbox/mapbox-gl-geocoder';

export interface GeocoderEvent {
  clear: EventEmitter<void>;
  loading: EventEmitter<{ query: string }>;
  results: EventEmitter<Results>;
  result: EventEmitter<{ result: Result }>;
  error: EventEmitter<any>;
  geocoderResults: EventEmitter<Results>;
  geocoderResult: EventEmitter<{ result: Result }>;
  geocoderError: EventEmitter<any>;
}

@Directive({
  selector: '[mglGeocoder]',
})
export class GeocoderControlDirective
  implements AfterContentInit, OnChanges, GeocoderEvent {
  /* Init inputs */
  @Input() countries?: string;
  @Input() placeholder?: string;
  @Input() zoom?: number;
  @Input() bbox?: [number, number, number, number];
  @Input() types?: string;
  @Input() flyTo?: boolean;
  @Input() minLength?: number;
  @Input() limit?: number;
  @Input() language?: string;
  @Input() accessToken?: string;
  @Input() filter?: (feature: Result) => boolean;
  @Input() localGeocoder?: (query: string) => Result[];
  @Input() mapboxgl?: Map;
  @Input() marker: boolean | Marker = false;

  /* Dynamic inputs */
  @Input() proximity?: LngLatLiteral;
  @Input() searchInput: string;

  @Output() clear = new EventEmitter<void>();
  @Output() loading = new EventEmitter<{ query: string }>();

  @Output() geocoderResults = new EventEmitter<Results>();

  @Output() geocoderResult = new EventEmitter<{ result: Result }>();

  @Output() geocoderError = new EventEmitter<any>();
  /**
   * @deprecated Use geocoderResults instead
   */
  @Output() results = new EventEmitter<Results>();
  /**
   * @deprecated Use geocoderResult instead
   */
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() result = new EventEmitter<{ result: Result }>();
  /**
   * @deprecated Use geocoderError instead
   */
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() error = new EventEmitter<any>();

  geocoder: MapboxGeocoder;

  private lastResultId?: string | number;

  constructor(
    private mapService: MapService,
    private zone: NgZone,
    @Host() private controlComponent: ControlComponent<MapboxGeocoder>,
    @Optional()
    @Inject(MAPBOX_GEOCODER_API_KEY)
    private readonly MAPBOX_GEOCODER_API_KEY: string
  ) {}

  ngAfterContentInit() {
    this.mapService.mapCreated$.subscribe(() => {
      if (this.controlComponent.control) {
        throw new Error('Another control is already set for this control');
      }
      const options: GeocoderOptions = {
        proximity: this.proximity,
        countries: this.countries,
        placeholder: this.placeholder,
        zoom: this.zoom,
        bbox: this.bbox,
        types: this.types,
        flyTo: this.flyTo,
        minLength: this.minLength,
        limit: this.limit,
        language: this.language,
        filter: this.filter,
        localGeocoder: this.localGeocoder,
        accessToken: this.accessToken || this.MAPBOX_GEOCODER_API_KEY,
        mapboxgl: this.mapboxgl,
        marker: this.marker,
      };

      Object.keys(options).forEach((key: string) => {
        const tkey = key as keyof typeof options;
        if (options[tkey] === undefined) {
          delete options[tkey];
        }
      });
      this.geocoder = new MapboxGeocoder(options);
      this.hookEvents(this);
      this.addControl();
    });
    if (this.searchInput) {
      this.mapService.mapLoaded$.subscribe(() => {
        this.geocoder.query(this.searchInput);
      });
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.geocoder) {
      return;
    }
    if (changes.proximity && !changes.proximity.isFirstChange()) {
      this.geocoder.setProximity(changes.proximity.currentValue);
    }
    if (changes.searchInput) {
      this.geocoder.query(this.searchInput);
    }
  }

  private addControl() {
    this.controlComponent.control = this.geocoder;
    this.mapService.addControl(
      this.controlComponent.control,
      this.controlComponent.position
    );
  }

  private hookEvents(events: GeocoderEvent) {
    this.warnDeprecatedOutputs(events);
    if (
      events.results.observers.length ||
      events.geocoderResults.observers.length
    ) {
      this.geocoder.on('results', (evt: Results) =>
        this.zone.run(() => {
          events.geocoderResults.emit(evt);
          events.results.emit(evt);
        })
      );
    }
    if (
      events.geocoderResult.observers.length ||
      events.result.observers.length
    ) {
      this.geocoder.on('result', (evt: { result: Result }) => {
        // Workaroud issue https://github.com/mapbox/mapbox-gl-geocoder/issues/99
        if (this.lastResultId !== evt.result.id) {
          this.lastResultId = evt.result.id;
          this.zone.run(() => {
            events.geocoderResult.emit(evt);
            events.result.emit(evt);
          });
        }
      });
    }
    if (
      events.error.observers.length ||
      events.geocoderError.observers.length
    ) {
      this.geocoder.on('error', (evt: any) =>
        this.zone.run(() => {
          events.geocoderError.emit(evt);
          events.error.emit(evt);
        })
      );
    }
    if (events.loading.observers.length) {
      this.geocoder.on('loading', (evt: { query: string }) =>
        this.zone.run(() => events.loading.emit(evt))
      );
    }
    if (events.clear.observers.length) {
      this.geocoder.on('clear', () => this.zone.run(() => events.clear.emit()));
    }
  }

  private warnDeprecatedOutputs(events: GeocoderEvent) {
    const dw = deprecationWarning.bind(
      undefined,
      GeocoderControlDirective.name
    );
    if (events.results.observers.length) {
      dw('results', 'geocoderResults');
    }
    if (events.result.observers.length) {
      dw('result', 'geocoderResult');
    }
    if (events.error.observers.length) {
      dw('error', 'geocoderError');
    }
  }
}
