sap.ui.define([
    'jquery.sap.global',
	"sap/dm/dme/podfoundation/controller/PluginViewController",
	"sap/ui/model/json/JSONModel",
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/MessageType"],    
    function (jQuery, PluginViewController, JSONModel, DateFormat,MessageType) {
	"use strict";

	return PluginViewController.extend("hitachi.custom.plugins.toolsLoading.toolsLoading.controller.MainView", {
		onInit: function () {
			PluginViewController.prototype.onInit.apply(this, arguments);
            // Initialize the model
            let oModel = new JSONModel();
            this.getView().setModel(oModel);
            let oInputModel = new JSONModel();
            this.getView().setModel(oInputModel, "input");           
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
            let sResource = this.getPodSelectionModel().getResource().resource;
                   
            let sGetLoadedToolsUrl = `${this.getPublicApiRestDataSourceUri()}/tool/v1/loadedTools?plant=${sPlant}&location=${sResource}&locationType=RESOURCE`;
        
            this.ajaxGetRequest(sGetLoadedToolsUrl, null,
                function (oLoadedTools) {
        
                    if (oLoadedTools?.tools?.length > 0) {
                        let oToolsList = [];  // Initialize array to store tools details
        
                        // Map each tool to a Promise that fetches its details
                        let toolDetailsPromises = oLoadedTools.tools.map(tool => {
                            let sGetToolDetailsUrl = `${that.getPublicApiRestDataSourceUri()}/tool/v1/tools?plant=${sPlant}&toolNumber=${tool.toolNumber}&toolType=EQUIPMENT_PRT&origin=LOCAL`;
        
                            return new Promise((resolve, reject) => {
                                that.ajaxGetRequest(sGetToolDetailsUrl, null,
                                    function (oToolDetail) {
                                        if (oToolDetail?.content?.length > 0) {
                                            let toolDetail = oToolDetail.content[0]; // Get the tool details only without metadata
        
                                            // Access customValues
                                            let calibrationDate = toolDetail.customValues?.find(cv => cv.attribute === "CALIBRATION")?.value;
                                            let cycleValue = toolDetail.customValues?.find(cv => cv.attribute === "CYCLE")?.value;
        
                                            if (calibrationDate && cycleValue) {
                                                let oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
        
                                                // Parse calibration date
                                                let calibratedUntilDate = new Date(calibrationDate);
                                                if (isNaN(calibratedUntilDate)) {
                                                    console.warn(`Invalid calibration date for toolNumber: ${toolDetail.toolNumber}`);
                                                    toolDetail.calibratedUntil = ""; // Fallback for invalid date
                                                } else {
                                                    // Add cycle days to the calibration date
                                                    calibratedUntilDate.setDate(calibratedUntilDate.getDate() + parseInt(cycleValue));
                                                    toolDetail.calibratedUntil = oDateFormat.format(calibratedUntilDate); // Set calculated date
                                                }
                                            } else {
                                                toolDetail.calibratedUntil = ""; // Fallback if calibration or cycle data is missing
                                            }
        
                                            // Push modified tool detail to the list
                                            oToolsList.push(toolDetail);
                                        } else {
                                            console.warn(`No content found for toolNumber: ${tool.toolNumber}`);
                                        }
                                        resolve();
                                    },
                                    function (oError) {
                                        console.error("Error fetching tool details:", oError);
                                        reject(oError);
                                    }
                                );
                            });
                        });
        
                        // Wait until all tool details are fetched
                        Promise.all(toolDetailsPromises)
                            .then(() => {
                                // Set the accumulated tool details to the model
                                that.getView().getModel().setData({ oToolsList });
                                that.setBusy(false);  // Set busy to false only after all details are fetched
                            })
                            .catch(error => {
                                console.error("Error loading all tool details:", error);
                                that.getView().getModel().setData([]); // Clear the table on error
                                that.setBusy(false);
                            });
        
                    } else {
                        that.getView().getModel().setData([]); // Clear the table if no tools are loaded
                        that.setBusy(false);
                    }
                },
                function (oError, sHttpErrorMessage) {
                    console.error("Error loading tools list:", oError || sHttpErrorMessage);
                    that.getView().getModel().setData([]); // Clear the table on error
                    that.setBusy(false);
                }
            );
        },
        
        onPressSubmitButton: function () {
            let that = this;
            let sPlant = this.getPodController().getUserPlant();
            let sUserId = this.getPodController().getUserId();
            let sResource = this.getPodSelectionModel().getResource().resource;             
            let sOperation = this.getPodSelectionModel().getOperation().operation;
            let sSFC = this.getPodSelectionModel().getDistinctSelection().sfcData.sfc;
            let statusInWork = this.getPodSelectionModel().getOperation().statusCode.statusInWork;
            let toolNumber = this.getView().getModel("input").getData().toolNumber;
            
            let sGetToolDetailsUrl = `${that.getPublicApiRestDataSourceUri()}/tool/v1/tools?plant=${sPlant}&toolNumber=${toolNumber}&toolType=EQUIPMENT_PRT&origin=LOCAL`;
        
            this.ajaxGetRequest(sGetToolDetailsUrl, null,
                function (oScannedTool) {
        
                    // Ensure Scanned Tool exists and is not empty
                    if (oScannedTool.content && oScannedTool.content.length > 0) {
                        let scannedTool = oScannedTool.content[0];
        
                        // Check if the user is certified
                        that.checkCertification(sPlant, sUserId, scannedTool.customValues[3].value, function(result) {
                            if (!result) {
                                that.getPodController().showErrorMessage("You are not certified to use tool " + toolNumber, false, false);
                                
                                // Clear the input field after scan
                                that.getView().byId("toolNumber").setValue("");
                                that.getView().byId("toolNumber").focus();
                                that.getView().getModel("input").setProperty("/toolNumber", "");

                                return; // Stop execution if not certified
                            }
        
                            // If certified, proceed with tool processing
                            if (scannedTool.loadedLocation) {
                                that.unloadTool(toolNumber, sPlant, scannedTool.loadedLocation);
                            } else {
                                that.loadTool(toolNumber, sPlant, sResource, sOperation, sSFC, statusInWork);
                            }
        
                            // Clear the input field after scan
                            that.getView().byId("toolNumber").setValue("");
                            that.getView().byId("toolNumber").focus();
                            that.getView().getModel("input").setProperty("/toolNumber", "");
        
                            // Refresh the tools list after scan
                            setTimeout(() => {
                                that.loadToolsList();
                            }, 500);
                        });
                    } else {
                        that.getPodController().showErrorMessage("Tool " + toolNumber + " not found", false, false);
                    }
                },
        
                function (oError, sHttpErrorMessage) {
                    let err = oError || sHttpErrorMessage;
                    console.error("Get Tool Details Error:", err);
                }
            );
        },

        //Check Certification
        checkCertification: function(sPlant, sUserId, sCertification, callback) {
            let that = this;
            
            // If sCertification is empty or null, return TRUE immediately
            if (!sCertification) {
                callback(true);
                return;
            }

            let getUserDetailsURL = `${that.getPublicApiRestDataSourceUri()}/user/v1/users?plant=${sPlant}&userId=${sUserId}`;
            
            that.ajaxGetRequest(getUserDetailsURL, null, 
                function (oUserDetails) {
                    
                    let hasCertification = oUserDetails.userCertifications?.some(cert => 
                        cert.certification === sCertification && cert.status === "ENABLED"
                    );
                    
                    callback(hasCertification);
                },
                function (oError, sHttpErrorMessage) {
                    let err = oError || sHttpErrorMessage;
                    console.error("Get User Details Error:", err);
                    callback(false); // Return false in case of an error
                }
            );
        },
        
        // Unload Tool
        unloadTool: function(toolNumber, sPlant, loadedLocation){
            let that = this;            
            let unloadToolURL = `${that.getPublicApiRestDataSourceUri()}/tool/v1/unloadTool`;
            let unloadToolPayload = {
                "plant": sPlant,
                "locationType": "RESOURCE",
                "location": loadedLocation, 
                "toolNumber": toolNumber
            };       
            
            that.ajaxPostRequest(unloadToolURL, unloadToolPayload, 
                function () {
                    that.getPodController().showSuccessMessage("Tool Unloaded: " + toolNumber, true, false);
                },
                function (oError, sHttpErrorMessage) {
                    let err = oError || sHttpErrorMessage;
                    that.getPodController().showErrorMessage("Unload Tool Error: " + err.message, false, false);
                    console.error("Unload Tool Error:", err);
                }
            );
        },
        
        // Load Tool and Log Usage
        loadTool: function (toolNumber, sPlant, sResource, sOperation, sSFC, statusInWork) {
            let that = this;

            // If sOperation is not started, then cancel loadTool
            if (!statusInWork) {
                that.getPodController().showErrorMessage("Tool Load Error: Operation " + sOperation + " not started", false, false);
                return;
            }

            let loadToolURL = `${that.getPublicApiRestDataSourceUri()}/tool/v1/loadTool`;
            let loadToolPayload = {
                "plant": sPlant,
                "locationType": "RESOURCE",
                "location": sResource,
                "toolNumber": toolNumber
            };
        
            that.ajaxPostRequest(loadToolURL, loadToolPayload, 
                function () {
                    that.getPodController().showSuccessMessage("Tool Loaded: " + toolNumber, true, false);
                    
                    let logToolURL = `${that.getPublicApiRestDataSourceUri()}/tool/v1/tools/manualToolUsageLog`;
                    let logToolPayload = {
                        "plant": sPlant,
                        "toolNumber": toolNumber,
                        "resource": sResource,
                        "operation": sOperation,
                        "sfc": sSFC,
                        "usageCount": 1
                    };
        
                    that.ajaxPostRequest(logToolURL, logToolPayload, 
                        function () {
                            that.getPodController().showSuccessMessage("Tool Usage Logged: " + toolNumber, true, false);
                        },
                        function (oError, sHttpErrorMessage) {
                            let err = oError || sHttpErrorMessage;
                            console.error("Log Tool Error:", err);
                        }
                    );                           
                },
                function (oError, sHttpErrorMessage) {
                    let err = oError || sHttpErrorMessage;
                    that.getPodController().showErrorMessage("Load Tool Error: " + err.message, false, false);
                    console.error("Load Tool Error:", err);
                }
            );
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
            const oInput = this.byId("toolNumber");
            if (oInput) {
                oInput.focus();  // Set focus on the input field
            }  
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