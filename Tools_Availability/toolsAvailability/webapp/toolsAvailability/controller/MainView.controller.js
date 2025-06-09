sap.ui.define([
    'jquery.sap.global',
	"sap/dm/dme/podfoundation/controller/PluginViewController",
	"sap/ui/model/json/JSONModel",
    "sap/ui/core/format/DateFormat"],    
    function (jQuery, PluginViewController, JSONModel, DateFormat) {
	"use strict";

	return PluginViewController.extend("hitachi.custom.plugins.toolsAvailability.toolsAvailability.controller.MainView", {
		onInit: function () {
			PluginViewController.prototype.onInit.apply(this, arguments);
            // Initialize the model
            let oModel = new JSONModel();
            this.getView().setModel(oModel);           
		},

        onBeforeRenderingPlugin: function () {
            try {
                var oConfig = this.getConfiguration();
                this.getView().byId("backButton").setVisible(oConfig.backButtonVisible);
                this.getView().byId("closeButton").setVisible(oConfig.closeButtonVisible);
                this.getView().byId("headerTitle").setText(oConfig.title);
            } catch (err) {
                jQuery.sap.log.error("Error during onBeforeRenderingPlugin: " + err.message);
            }
            //this.unsubscribe("OperationListSelectEvent", this.loadToolsList, this); // Avoid duplicate subscriptions
            //this.subscribe("OperationListSelectEvent", this.loadToolsList, this);
            this.loadToolsList();
        },

        loadToolsList: function () {
            let that = this;
            let sPlant = this.getPodController().getUserPlant();
            let sOperation = this.getPodSelectionModel().getOperation().operation;
        
            let sGetOperationUrl = `${this.getPublicApiRestDataSourceUri()}/operationActivity/v1/operationActivities?plant=${sPlant}&operation=${sOperation}&type=NORMAL_OPERATION&currentVersion=true`;
        
            this.ajaxGetRequest(sGetOperationUrl, null, function (oOperation) {
                let toolsGroupSet = new Set();
        
                if (oOperation?.content?.length > 0) {
                    oOperation.content.forEach(operation => {
                        operation.customValues?.forEach(customValue => {
                            if (customValue.attribute === "TOOLS_GROUP" && customValue.value) {
                                customValue.value.split(',').forEach(group => toolsGroupSet.add(group.trim()));
                            }
                        });
                    });
                }
        
                if (toolsGroupSet.size === 0) {
                    that.getView().getModel().setData([]); // Clear the table
                    that.setBusy(false);
                    return;
                }
        
                let sBaseUrl = `${that.getPublicApiRestDataSourceUri()}/tool/v1/tools?plant=${sPlant}&toolType=EQUIPMENT_PRT&origin=LOCAL&size=100`;
                let oToolsList = [];
                let toolNumbersSet = new Set();
                let oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
        
                // Helper to fetch additional pages
                function fetchToolPage(pageNumber, totalPages) {
                    if (pageNumber >= totalPages) {
                        that.getView().getModel().setData(oToolsList);
                        that.setBusy(false);
                        return;
                    }
        
                    let pagedUrl = `${sBaseUrl}&page=${pageNumber}`;
                    that.ajaxGetRequest(pagedUrl, null, function (oPagedResponse) {
                        if (oPagedResponse?.content?.length > 0) {
                            oPagedResponse.content.forEach(tool => {
                                let groupValue = tool.customValues?.find(cv => cv.attribute === "GROUP")?.value;
                                if (groupValue && toolsGroupSet.has(groupValue) && !toolNumbersSet.has(tool.toolNumber)) {
                                    toolNumbersSet.add(tool.toolNumber);
        
                                    let calibrationDate = tool.customValues?.find(cv => cv.attribute === "CALIBRATION")?.value;
                                    let cycleValue = tool.customValues?.find(cv => cv.attribute === "CYCLE")?.value;
        
                                    if (calibrationDate && cycleValue) {
                                        let calibratedUntilDate = new Date(calibrationDate);
                                        calibratedUntilDate.setDate(calibratedUntilDate.getDate() + parseInt(cycleValue));
                                        tool.calibratedUntil = oDateFormat.format(calibratedUntilDate);
                                    } else {
                                        tool.calibratedUntil = "";
                                    }
        
                                    oToolsList.push(tool);
                                }
                            });
                        }
        
                        fetchToolPage(pageNumber + 1, totalPages);
                    }, function (oError, sHttpErrorMessage) {
                        console.error("Error loading tool page " + pageNumber + ":", oError || sHttpErrorMessage);
                        that.getView().getModel().setData([]); // Clear the table on error
                        that.setBusy(false);
                    });
                }
        
                // Initial request to get page 0 and totalPages
                that.ajaxGetRequest(sBaseUrl, null, function (oInitialResponse) {
                    if (oInitialResponse?.content?.length > 0) {
                        oInitialResponse.content.forEach(tool => {
                            let groupValue = tool.customValues?.find(cv => cv.attribute === "GROUP")?.value;
                            if (groupValue && toolsGroupSet.has(groupValue) && !toolNumbersSet.has(tool.toolNumber)) {
                                toolNumbersSet.add(tool.toolNumber);
        
                                let calibrationDate = tool.customValues?.find(cv => cv.attribute === "CALIBRATION")?.value;
                                let cycleValue = tool.customValues?.find(cv => cv.attribute === "CYCLE")?.value;
        
                                if (calibrationDate && cycleValue) {
                                    let calibratedUntilDate = new Date(calibrationDate);
                                    calibratedUntilDate.setDate(calibratedUntilDate.getDate() + parseInt(cycleValue));
                                    tool.calibratedUntil = oDateFormat.format(calibratedUntilDate);
                                } else {
                                    tool.calibratedUntil = "";
                                }
        
                                oToolsList.push(tool);
                            }
                        });
                    }
        
                    let totalPages = oInitialResponse.totalPages || 1;
                    if (totalPages > 1) {
                        fetchToolPage(1, totalPages); // Start from page 1
                    } else {
                        that.getView().getModel().setData(oToolsList);
                        that.setBusy(false);
                    }
                }, function (oError, sHttpErrorMessage) {
                    console.error("Error loading initial tool data:", oError || sHttpErrorMessage);
                    that.getView().getModel().setData([]); // Clear the table on error
                    that.setBusy(false);
                });
        
            }, function (oError, sHttpErrorMessage) {
                console.error("Error loading Tools Group data:", oError || sHttpErrorMessage);
                that.getView().getModel().setData([]); // Clear the table on error
                that.setBusy(false);
            });
        }, 

        formatCalibrationDate: function (sDate) {
            if (!sDate) return "None"; // Default state
            let oCurrentDate = new Date();
            let oCalibrationDate = new Date(sDate);
            return oCalibrationDate < oCurrentDate ? "Error" : "Success"; // Error = Red, Success = Green
        },
        
        formatStatusColor: function (sStatus) {
            return sStatus === "ENABLED" ? "Success" : "Error"; // Success = Green, Error = Red
        },
        
        onAfterRendering: function () {
            this.loadToolsList(); // Ensure refresh logic is triggered after rendering
        },

        isSubscribingToNotifications: function() {
            return true;
        },

        getCustomNotificationEvents: function(sTopic) {
            // return custom events if needed
        },

        getNotificationMessageHandler: function(sTopic) {
            return null; // or return a handler if needed
        },

        _handleNotificationMessage: function(oMsg) {
            // Handle notifications if implemented
        },

        onExit: function () {
            //this.unsubscribe("OperationListSelectEvent", this.loadToolsList, this);
            PluginViewController.prototype.onExit.apply(this, arguments);
        },
        
	});
});