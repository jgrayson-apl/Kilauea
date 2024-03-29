/*
 Copyright 2017 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.​
 */

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/on",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/core/promiseUtils",
  "esri/core/watchUtils",
  "esri/Graphic",
  "esri/geometry/Point",
  "esri/geometry/Polyline",
  "esri/geometry/geometryEngine",
  "esri/layers/GraphicsLayer",
  "esri/widgets/Sketch/SketchViewModel"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             Color, colors, on, dom, domClass, domConstruct,
             promiseUtils, watchUtils, Graphic, Point, Polyline, geometryEngine, GraphicsLayer, SketchViewModel) {

  return declare(null, {

    /**
     *
     */
    constructor: function () {
      this.CSS = {loading: "configurable-application--loading"};
      this.base = null;
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if (!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if (!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({item: firstItem, appProxies: appProxies}).then((map) => {
        viewProperties.map = map;
        return itemUtils.createView(viewProperties).then((view) => {
          domClass.remove(document.body, this.CSS.loading);
          this.viewReady(config, firstItem, view);
        });
      });


    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      const title_node = domConstruct.create("div", {className: "panel panel-dark-blue font-size-3", innerHTML: config.title});
      view.ui.add(title_node, {position: "top-left", index: 0});

      // SLIDES //
      this.initializeSlides(view);

      // SPIN //
      this.initializeViewSpinTools(view);

      // HEADING //
      this.createHeadingSlider(view);

      // PROFILES //
      this.initializeProfileTool(view);

    },

    /**
     *
     * @param view
     */
    initializeSlides: function (view) {

      if (view.map.presentation && view.map.presentation.slides && (view.map.presentation.slides.length > 0)) {
        // PLACES PANEL //
        const placesPanel = domConstruct.create("div", {className: "panel panel-dark-blue"});
        view.ui.add(placesPanel, "top-right");

        // SLIDES //
        const slides = view.map.presentation.slides;
        slides.forEach((slide) => {

          const slide_btn = domConstruct.create("button", {className: "btn btn-grouped"}, placesPanel);
          domConstruct.create("img", {className: "", src: slide.thumbnail.url}, slide_btn);
          domConstruct.create("div", {className: "font-size--3", innerHTML: slide.title.text}, slide_btn);

          on(slide_btn, "click", () => {
            slide.applyTo(view, {
              animate: true,
              // speedFactor: 0.1,
              easing: "in-out-cubic"   // linear, in-cubic, out-cubic, in-out-cubic, in-expo, out-expo, in-out-expo
            });
          });
        });

        view.on("layerview-create", (evt) => {
          if (evt.layer.visible) {
            slides.forEach((slide) => {
              slide.visibleLayers.add({id: evt.layer.id});
            });
          }
        });

      }

    },

    /**
     *
     * @param view
     */
    initializeViewSpinTools: function (view) {

      let spin_direction = "none";
      let spin_handle = null;
      let spin_step = 0.1;
      const spin_fps = 90;

      const _spin = () => {
        if (spin_direction !== "none") {
          const heading = (view.camera.heading + ((spin_direction === "right") ? spin_step : -spin_step));
          spin_handle = view.goTo({target: view.viewpoint.targetGeometry, heading: heading}, {animate: false}).then(() => {
            if (spin_direction !== "none") {
              setTimeout(() => {
                requestAnimationFrame(_spin);
              }, 1000 / spin_fps);
            }
          });
        }
      };

      const enableSpin = (direction) => {
        spin_direction = direction;
        if (spin_direction !== "none") {
          requestAnimationFrame(_spin);
        } else {
          spin_handle && !spin_handle.isFulfilled() && spin_handle.cancel();
        }
      };

      let previous_direction = "none";
      this.spin_pause = () => {
        previous_direction = spin_direction;
        enableSpin("none");
      };
      this.spin_resume = () => {
        enableSpin(previous_direction);
      };

      const viewSpinNode = domConstruct.create("div", {className: "view-spin-node"}, view.root);
      const spinLeftBtn = domConstruct.create("span", {className: "spin-btn icon-ui-arrow-left-circled icon-ui-flush font-size-2 esri-interactive", title: "Spin Left"}, viewSpinNode);
      const alwaysUpBtn = domConstruct.create("span", {id: "always-up-btn", className: "spin-btn icon-ui-compass icon-ui-flush font-size--1 esri-interactive", title: "Always Up"}, viewSpinNode);
      const spinRightBtn = domConstruct.create("span", {className: "spin-btn icon-ui-arrow-right-circled icon-ui-flush font-size-2 esri-interactive", title: "Spin Right"}, viewSpinNode);

      // SPIN LEFT //
      on(spinLeftBtn, "click", () => {
        enableSpin("none");
        domClass.remove(spinRightBtn, "selected");
        domClass.toggle(spinLeftBtn, "selected");
        if (domClass.contains(spinLeftBtn, "selected")) {
          enableSpin("left");
        }
      });

      // SPIN RIGHT //
      on(spinRightBtn, "click", () => {
        enableSpin("none");
        domClass.remove(spinLeftBtn, "selected");
        domClass.toggle(spinRightBtn, "selected");
        if (domClass.contains(spinRightBtn, "selected")) {
          enableSpin("right");
        }
      });

      // ALWAYS UP //
      let always_up = false;
      on(alwaysUpBtn, "click", () => {
        domClass.toggle(alwaysUpBtn, "selected");
        always_up = domClass.contains(alwaysUpBtn, "selected");
      });
    },

    /**
     *
     * @param view
     */
    createHeadingSlider: function (view) {

      const set_camera_heading = (heading, animate) => {
        const camera = view.camera.clone();
        camera.heading = heading;
        view.goTo(camera, {animate: false});
      };

      const headingPanel = domConstruct.create("div", {className: "panel panel-dark-blue padding-trailer-quarter"});
      view.ui.add(headingPanel, "top-right");

      const directionsTable = domConstruct.create("table", {className: "slider-table trailer-0"}, headingPanel);
      const directionsRow = domConstruct.create("tr", {}, directionsTable);
      domConstruct.create("td", {}, directionsRow);
      const directionsNode = domConstruct.create("div", {className: "directions-node text-center"}, domConstruct.create("td", {}, directionsRow));
      domConstruct.create("td", {}, directionsRow);

      const directions = [
        {label: "N", tooltip: "North", heading: 0.0},
        {label: "ne", tooltip: "North East", heading: 45.0},
        {label: "E", tooltip: "East", heading: 90.0},
        {label: "se", tooltip: "South East", heading: 135.0},
        {label: "S", tooltip: "South", heading: 180.0},
        {label: "sw", tooltip: "South West", heading: 225.0},
        {label: "W", tooltip: "West", heading: 270.0},
        {label: "nw", tooltip: "North West", heading: 315.0},
        {label: "N", tooltip: "North", heading: 360.0}
      ];
      directions.forEach(dirInfo => {
        const dirNode = domConstruct.create("span", {
          className: "direction-node inline-block text-center font-size--3 avenir-demi esri-interactive",
          innerHTML: dirInfo.label,
          title: dirInfo.tooltip
        }, directionsNode);
        on(dirNode, "click", () => {
          set_camera_heading(dirInfo.heading);
        });
      });

      const sliderRow = domConstruct.create("tr", {}, directionsTable);
      const sliderLeftNode = domConstruct.create("span", {
        title: "decrease/left/counter-clockwise",
        className: "direction-node esri-interactive icon-ui-left icon-ui-flush font-size-1"
      }, domConstruct.create("td", {}, sliderRow));
      const slider = domConstruct.create("input", {
        className: "font-size-1",
        type: "range",
        min: 0, max: 360, step: 1, value: 0
      }, domConstruct.create("td", {}, sliderRow));
      const sliderRightNode = domConstruct.create("span", {
        title: "increase/right/clockwise",
        className: "direction-node esri-interactive icon-ui-right icon-ui-flush font-size-1"
      }, domConstruct.create("td", {}, sliderRow));

      on(sliderLeftNode, "click", () => {
        set_camera_heading(slider.valueAsNumber - 5);
      });
      on(sliderRightNode, "click", () => {
        set_camera_heading(slider.valueAsNumber + 5);
      });

      const headingRow = domConstruct.create("tr", {}, directionsTable);
      domConstruct.create("td", {}, headingRow);
      const heading_label = domConstruct.create("div", {className: "direction-label text-center font-size-1 avenir-bold", innerHTML: "0&deg;"}, domConstruct.create("td", {}, headingRow));
      domConstruct.create("td", {}, headingRow);

      on(slider, "input", () => {
        set_camera_heading(slider.valueAsNumber);
      });
      watchUtils.init(view, "camera.heading", (heading) => {
        if (heading) {
          heading_label.innerHTML = `${ heading.toFixed(0) }&deg;`;
          slider.valueAsNumber = heading;
        }
      });

      // LOOK AROUND NAVIGATION //
      this.initializeLookAroundNavigation(view, headingPanel);

    },

    /**
     *
     * @param view
     * @param panel
     */
    initializeLookAroundNavigation: function (view, panel) {

      const look_around_handlers = [];

      const clear_look_around_handlers = () => {
        if (look_around_handlers.length > 0) {
          look_around_handlers.forEach(handler => {
            handler.remove();
            handler = null;
          });
          look_around_handlers.length = 0;
        }
      };

      const stop_propagation = evt => evt.stopPropagation();

      const create_look_around_handlers = () => {

        look_around_handlers.push(view.on("pointer-enter", function (evt) {
          view.container.style.cursor = "all-scroll";
          evt.stopPropagation();
        }));

        // B + Left-click + Drag //
        look_around_handlers.push(view.on("drag", ["b"], function (evt) {
          if (evt.button !== 0) {
            evt.stopPropagation();
          }
        }));

        look_around_handlers.push(view.on("immediate-click", stop_propagation));
        look_around_handlers.push(view.on("click", stop_propagation));
        look_around_handlers.push(view.on("double-click", stop_propagation));
        look_around_handlers.push(view.on("hold", stop_propagation));
        look_around_handlers.push(view.on("key-down", stop_propagation));
        look_around_handlers.push(view.on("key-up", stop_propagation));
        look_around_handlers.push(view.on("mouse-wheel", stop_propagation));
        look_around_handlers.push(view.on("pointer-down", stop_propagation));
        look_around_handlers.push(view.on("pointer-move", stop_propagation));
        look_around_handlers.push(view.on("pointer-up", stop_propagation));

        look_around_handlers.push(view.on("pointer-leave", function (evt) {
          view.container.style.cursor = "default";
          evt.stopPropagation();
        }));
      };

      // LOOK AROUND BUTTON //
      const look_around_btn = domConstruct.create("button", {className: "btn btn-fill", innerHTML: "Look Around"}, panel);
      on(look_around_btn, "click", () => {
        domClass.toggle(look_around_btn, "icon-ui-check-mark");
        const is_enabled = domClass.contains(look_around_btn, "icon-ui-check-mark");
        if (!is_enabled) {
          clear_look_around_handlers();
          view.inputManager._inputManager._activeKeyModifiers = new Set([]);
        } else {
          view.inputManager._inputManager._activeKeyModifiers = new Set(["b"]);
          create_look_around_handlers();
        }
      });

    },

    /**
     *
     * @param view
     */
    initializeProfileTool: function (view) {

      // CHART PANEL //
      const chart_parent_panel = domConstruct.create("div", {id: "options-panel", className: "panel panel-dark-blue panel-no-padding"});
      view.ui.add(chart_parent_panel, "bottom-left");

      // TOOLS PANEL //
      const tools_panel = domConstruct.create("div", {id: "tools-panel", className: "panel panel-dark-blue panel-no-padding panel-no-border padding-leader-quarter padding-trailer-quarter"}, chart_parent_panel);
      // LABEL //
      domConstruct.create("span", {className: "inline-block leader-quarter margin-left-1", innerHTML: "Elevation Profiles"}, tools_panel);

      // TOGGLE PANEL //
      const toggle_tool = domConstruct.create("span", {className: "icon-ui-down font-size-2 esri-interactive margin-right-half right", title: "toggle panel"}, tools_panel);
      on(toggle_tool, "click", () => {
        domClass.toggle(toggle_tool, "icon-ui-down icon-ui-up");
        domClass.toggle(actions_node, "hide");
        domClass.toggle(chart_panel, "collapsed");
        if (this.reset_profile_ui) {
          this.reset_profile_ui();
        }
        setTimeout(()=>{
          this.resizeProfileChart && this.resizeProfileChart();
        },500);
      });

      // ACTIONS NODE //
      const actions_node = domConstruct.create("span", {className: "right"}, tools_panel);

      // CHART PANEL //
      const chart_panel = domConstruct.create("div", {id: "profile-chart-panel", className: "panel panel-no-padding panel-no-border"}, chart_parent_panel);
      // PROFILE CHART //
      this.initializeProfileChart(view, chart_panel).then(() => {

        // TOGGLE PANEL //
        toggle_tool.click();

        // SKETCH LAYER //
        const sketch_layer = new GraphicsLayer();
        view.map.add(sketch_layer);

        // ELEVATION LAYERS //
        const before_elevation_layer = view.map.ground.layers.find(layer => {
          return (layer.title === "Terrain3D");
        });
        const after_elevation_layer = view.map.ground.layers.find(layer => {
          return (layer.title === "Kilauea_Elevation");
        });

        let elevations_handle;
        const setElevationAndUpdateProfile = (polyline) => {
          elevations_handle && (!elevations_handle.isFulfilled()) && elevations_handle.cancel();

          const polyline_length = geometryEngine.planarLength(polyline, "meters");
          if (polyline_length > 0) {
            const polyline_dense = geometryEngine.densify(polyline, (polyline_length / 150.0), "meters");

            elevations_handle = promiseUtils.eachAlways([
              before_elevation_layer.queryElevation(polyline_dense),
              after_elevation_layer.queryElevation(polyline_dense)
            ]).then((query_results) => {

              const profile_before = query_results[0].value.geometry;
              const profile_after = query_results[1].value.geometry;

              sketch_layer.graphics = [
                {geometry: profile_before, symbol: before_symbol},
                {geometry: polyline_dense, symbol: after_symbol}
              ];

              this.updateProfile(profile_before, profile_after);
            });
          }
        };

        const before_symbol = {
          type: "simple-line",
          style: "solid",
          color: Color.named.yellow,
          width: 3.5
        };
        const after_symbol = {
          type: "simple-line",
          style: "solid",
          color: Color.named.red,
          width: 1.5
        };
        const no_symbol = {
          type: "simple-line",
          style: "solid",
          color: Color.named.transparent,
          width: 0.0
        };

        // SKETCH //
        const sketch = new SketchViewModel({
          view: view,
          activeLineSymbol: no_symbol,
          pointSymbol: {
            type: "simple-marker",
            style: "circle",
            color: Color.named.darkblue.concat(0.3),
            size: "11px",
            outline: {
              color: Color.named.cyan,
              width: 1.5
            }
          },
          polylineSymbol: no_symbol,
          polygonSymbol: {
            type: "simple-fill",
            color: "rgba(138,43,226, 0.8)",
            style: "solid",
            outline: {
              color: "white",
              width: 1
            }
          }
        });
        sketch.on("create", (evt) => {
          setElevationAndUpdateProfile(evt.geometry);
        });
        sketch.on("create-complete", (evt) => {
          setElevationAndUpdateProfile(evt.geometry);
          domClass.toggle(line_tool, "icon-ui-edit");
        });
        sketch.on("create-cancel", () => {
          this.reset_profile_ui();
        });

        this.reset_profile_ui = () => {
          domClass.remove(line_tool, "icon-ui-edit");
          sketch.reset();
          sketch_layer.graphics.removeAll();
          this.updateProfile();
          view.focus();
        };


        // CLEAR //
        const clear_tool = domConstruct.create("button", {className: "btn margin-right-half right", innerHTML: "clear"}, actions_node);
        on(clear_tool, "click", () => {
          this.reset_profile_ui();
        });

        // DRAW LINE TOOL //
        const line_tool = domConstruct.create("button", {className: "btn margin-right-quarter right", innerHTML: "Sketch Line", title: "Use the C key to complete the sketch..."}, actions_node);
        on(line_tool, "click", () => {

          sketch.reset();
          sketch_layer.graphics.removeAll();
          this.updateProfile();

          domClass.toggle(line_tool, "icon-ui-edit");
          if (domClass.contains(line_tool, "icon-ui-edit")) {
            sketch.create("polyline");
            const draw_action = sketch.draw.activeAction;
            draw_action.on("cursor-update", (evt) => {
              const polyline = new Polyline({spatialReference: view.spatialReference, paths: []});
              polyline.addPath(evt.vertices);
              setElevationAndUpdateProfile(polyline);
            });
            view.focus();
          }
        });

      });
    },

    /**
     *
     * @param view
     * @param chart_panel
     */
    initializeProfileChart: function (view, chart_panel) {
      return new Promise((resolve, reject) => {
        require([
          "dojox/charting/Chart",
          "dojox/charting/axis2d/Default",
          "dojox/charting/plot2d/Grid",
          "dojox/charting/themes/Bahamation",
          "dojox/charting/plot2d/Areas",
          "dojox/charting/action2d/Tooltip",
          "dojox/charting/action2d/MouseIndicator",
        ], (Chart, Default, Grid, ChartTheme, Areas, ChartTooltip, MouseIndicator) => {

          const fontColor = "#fff";
          const lineStroke = {color: "#fff", width: 1.5};

          const chartNode = domConstruct.create("div", {id: "profile-chart-node"}, chart_panel);
          const profileChart = new Chart(chartNode);
          profileChart.setTheme(ChartTheme);
          profileChart.fill = profileChart.theme.plotarea.fill = "transparent";

          profileChart.addAxis("x", {
            title: "Distance (m)",
            titleGap: 5,
            titleOrientation: "away",
            titleFontColor: fontColor,
            natural: true,
            includeZero: true,
            fixUpper: "none",
            minorTicks: false,
            majorTick: lineStroke,
            stroke: lineStroke,
            font: "normal normal normal 9pt Avenir Next W00",
            fontColor: fontColor
          });
          profileChart.addAxis("y", {
            title: "Elevation (m)",
            titleGap: 10,
            titleFontColor: fontColor,
            vertical: true,
            min: 500,
            max: 1200,
            minorTicks: false,
            majorTick: lineStroke,
            stroke: lineStroke,
            font: "normal normal normal 9pt Avenir Next W00",
            fontColor: fontColor
          });

          profileChart.addPlot("grid", {
            type: Grid,
            hMajorLines: true,
            hMinorLines: false,
            vMajorLines: false,
            vMinorLines: false,
            majorHLine: {
              color: "#ddd",
              width: 0.5
            }
          });
          profileChart.addPlot("default", {
            type: Areas,
            tension: "S",
            precision: 1
          });

          const empty_data_before = [{x: 0, y: 0}, {x: 100, y: 0}];
          const empty_data_after = [{x: 0, y: 0}, {x: 100, y: 0}];


          const before_color = new Color("#80823b");
          before_color.a = 0.5;

          const after_color = new Color("#823e3d");
          after_color.a = 0.5;

          profileChart.addSeries("ElevationProfileAfter", empty_data_after, {
            stroke: {color: Color.named.red, width: 2.5},
            fill: after_color
            /*fill: {
             type: "linear",
             space: "plot",
             x1: 50, y1: 0, x2: 50, y2: 100,
             colors: [
             {
             offset: 0.0,
             color: Color.named.white.concat(0.1)
             },
             {
             offset: 1.0,
             color: "#820000"
             }
             ]
             }*/
          });
          profileChart.addSeries("ElevationProfileBefore", empty_data_before, {
            stroke: {color: Color.named.yellow, width: 2.5},
            fill: before_color
            /*fill: {
             type: "linear",
             space: "plot",
             x1: 50, y1: 0, x2: 50, y2: 100,
             colors: [
             {
             offset: 0.0,
             color: Color.named.saddlebrown.concat(0.1)
             },
             {
             offset: 1.0,
             color: Color.named.saddlebrown
             }
             ]
             }*/
          });

          const mouseIndicator = new MouseIndicator(profileChart, "default", {
            series: "ElevationProfileAfter",
            mouseOver: true,
            fill: "#fff",
            font: "normal normal normal 11pt Avenir Next W00",
            labelFunc: function (elevationInfo) {
              const profile_info_before = profile_infos_before.find(profile_info => {
                return (profile_info.x === elevationInfo.x);
              });
              const diff = (elevationInfo.y - profile_info_before.y).toFixed(1);
              return `Change: ${ diff } m`;
            }
          });

          profileChart.fullRender();

          this.resizeProfileChart = () => { profileChart.resize(); };
          view.on("resize", this.resizeProfileChart);

          // PROFILE INFOS //
          let profile_infos_before = empty_data_before;
          let profile_infos_after = empty_data_after;

          /**
           *
           * @param polyline_before
           * @param polyline_after
           */
          this.updateProfile = (polyline_before, polyline_after) => {
            profile_infos_before = empty_data_before;
            profile_infos_after = empty_data_after;

            if (polyline_before && polyline_after) {

              const profile_polyline_ZM_before = new Polyline({
                hasZ: true, hasM: true,
                paths: this.setMAsDistanceAlong(polyline_before),
                spatialReference: view.spatialReference
              });
              const profile_polyline_ZM_after = new Polyline({
                hasZ: true, hasM: true,
                paths: this.setMAsDistanceAlong(polyline_after),
                spatialReference: view.spatialReference
              });

              profile_infos_before = this._getProfileInfos(profile_polyline_ZM_before);
              profile_infos_after = this._getProfileInfos(profile_polyline_ZM_after);
            }

            profileChart.updateSeries("ElevationProfileBefore", profile_infos_before);
            profileChart.updateSeries("ElevationProfileAfter", profile_infos_after);
            profileChart.fullRender();
          };

          resolve();
        });
      });
    },

    /**
     *
     * @param polyline
     * @returns {{x,y,coords}[]}
     * @private
     */
    _getProfileInfos: function (polyline) {
      const profile_infos = [];
      polyline.paths.forEach((path) => {
        path.forEach((coords, coordsIndex) => {
          profile_infos.push({
            y: (coords[2] || 0.0),         // Z //
            x: (coords[3] || coordsIndex), // M //
            coords: coords,
            index: coordsIndex
          });
        });
      });
      return profile_infos;
    },

    /**
     *
     * @param polyline
     * @returns {Number[]}
     */
    setMAsDistanceAlong: function (polyline) {

      let distanceAlong = 0.0;
      return polyline.paths.map((part, partIdx) => {
        return part.map((coords, coordIdx) => {
          const location = polyline.getPoint(partIdx, coordIdx);
          const prevLocation = polyline.getPoint(partIdx, (coordIdx > 0) ? (coordIdx - 1) : 0);
          distanceAlong += geometryEngine.distance(prevLocation, location, "meters");
          return [coords[0], coords[1], coords[2] || 0.0, distanceAlong];
        });
      });
    }


  });
});

