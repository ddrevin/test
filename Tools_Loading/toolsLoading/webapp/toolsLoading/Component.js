sap.ui.define([
	"sap/dm/dme/podfoundation/component/production/ProductionUIComponent",
	"sap/ui/Device"
], function (ProductionUIComponent, Device) {
	"use strict";

	return ProductionUIComponent.extend("hitachi.custom.plugins.toolsLoading.toolsLoading.Component", {
		metadata: {
			manifest: "json"
		}
	});
});