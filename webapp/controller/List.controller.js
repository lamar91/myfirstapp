sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/Sorter",
    "sap/ui/model/FilterOperator",
    "sap/m/GroupHeaderListItem",
    "sap/ui/Device",
    "sap/ui/core/Fragment",
    "../model/formatter",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem, Device, Fragment, formatter, MessageBox, MsgToast) {
    "use strict";

    return BaseController.extend("auro.eng.inv.testingapp.controller.List", {

        formatter: formatter,

        /* =========================================================== */
        /* lifecycle methods                                           */
        /* =========================================================== */

        /**
         * Called when the list controller is instantiated. It sets up the event handling for the list/detail communication and other lifecycle tasks.
         * @public
         */
        onInit: function () {
            // Control state model
            var oList = this.byId("object"),
                oViewModel = this._createViewModel(),
                // Put down list's original value for busy indicator delay,
                // so it can be restored later on. Busy handling on the list is
                // taken care of by the list itself.
                iOriginalBusyDelay = oList ? oList.getBusyIndicatorDelay() : null;
                if(!oList){
                    return;
                }

            this._oGroupFunctions = {
                Freight: function (oContext) {
                    var iNumber = oContext.getProperty('Freight'),
                        key, text;
                    if (iNumber <= 20) {
                        key = "LE20";
                        text = this.getResourceBundle().getText("listGroup1Header1");
                    } else {
                        key = "GT20";
                        text = this.getResourceBundle().getText("listGroup1Header2");
                    }
                    return {
                        key: key,
                        text: text
                    };
                }.bind(this)
            };

            this._oList = oList;
            // keeps the filter and search state
            this._oListFilterState = {
                aFilter: [],
                aSearch: []
            };

            this.setModel(oViewModel, "listView");
            // Make sure, busy indication is showing immediately so there is no
            // break after the busy indication for loading the view's meta data is
            // ended (see promise 'oWhenMetadataIsLoaded' in AppController)
            oList.attachEventOnce("updateFinished", function () {
                //     // Restore original busy indicator delay for the list
                oViewModel.setProperty("/delay", iOriginalBusyDelay);
            });

            this.getView().addEventDelegate({
                onBeforeFirstShow: function () {
                    this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
                }.bind(this)
            });

            this.getRouter().getRoute("list").attachPatternMatched(this._onMasterMatched, this);
            this.getRouter().attachBypassed(this.onBypassed, this);
        },

        /* =========================================================== */
        /* event handlers                                              */
        /* =========================================================== */

        /**
         * After list data is available, this handler method updates the
         * list counter
         * @param {sap.ui.base.Event} oEvent the update finished event
         * @public
         */
        onUpdateFinished: function (oEvent) {
            // update the list object counter after new data is loaded
            this._updateListItemCount(oEvent.getParameter("total"));
        },

        /**
         * Event handler for the list search field. Applies current
         * filter value and triggers a new search. If the search field's
         * 'refresh' button has been pressed, no new search is triggered
         * and the list binding is refresh instead.
         * @param {sap.ui.base.Event} oEvent the search event
         * @public
         */
        onSearch: function (oEvent) {
            if (oEvent.getParameters().refreshButtonPressed) {
                // Search field's 'refresh' button has been pressed.
                // This is visible if you select any list item.
                // In this case no new search is triggered, we only
                // refresh the list binding.
                this.onRefresh();
                return;
            }

            var sQuery = oEvent.getParameter("query");

            if (sQuery) {
                this._oListFilterState.aSearch = [new Filter("OrderID", FilterOperator.Contains, sQuery)];
            } else {
                this._oListFilterState.aSearch = [];
            }
            this._applyFilterSearch();

        },

        /**
         * Event handler for refresh event. Keeps filter, sort
         * and group settings and refreshes the list binding.
         * @public
         */
        onRefresh: function () {
            this._oList.getBinding("items").refresh();
        },

        /**
         * Event handler for the filter, sort and group buttons to open the ViewSettingsDialog.
         * @param {sap.ui.base.Event} oEvent the button press event
         * @public
         */
        onOpenViewSettings: function (oEvent) {
            var sDialogTab = "filter";
            if (oEvent.getSource() instanceof sap.m.Button) {
                var sButtonId = oEvent.getSource().getId();
                if (sButtonId.match("sort")) {
                    sDialogTab = "sort";
                } else if (sButtonId.match("group")) {
                    sDialogTab = "group";
                }
            }
            // load asynchronous XML fragment
            if (!this.byId("viewSettingsDialog")) {
                Fragment.load({
                    id: this.getView().getId(),
                    name: "auro.eng.inv.testingapp.view.ViewSettingsDialog",
                    controller: this
                }).then(function (oDialog) {
                    // connect dialog to the root view of this component (models, lifecycle)
                    this.getView().addDependent(oDialog);
                    oDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
                    oDialog.open(sDialogTab);
                }.bind(this));
            } else {
                this.byId("viewSettingsDialog").open(sDialogTab);
            }
        },

        /**
         * Event handler called when ViewSettingsDialog has been confirmed, i.e.
         * has been closed with 'OK'. In the case, the currently chosen filters, sorters or groupers
         * are applied to the list, which can also mean that they
         * are removed from the list, in case they are
         * removed in the ViewSettingsDialog.
         * @param {sap.ui.base.Event} oEvent the confirm event
         * @public
         */
        onConfirmViewSettingsDialog: function (oEvent) {

            var aFilterItems = oEvent.getParameters().filterItems,
                aFilters = [],
                aCaptions = [];

            // update filter state:
            // combine the filter array and the filter string
            aFilterItems.forEach(function (oItem) {
                switch (oItem.getKey()) {
                    case "Filter1":
                        aFilters.push(new Filter("Freight", FilterOperator.LE, 100));
                        break;
                    case "Filter2":
                        aFilters.push(new Filter("Freight", FilterOperator.GT, 100));
                        break;
                    default:
                        break;
                }
                aCaptions.push(oItem.getText());
            });

            this._oListFilterState.aFilter = aFilters;
            this._updateFilterBar(aCaptions.join(", "));
            this._applyFilterSearch();
            this._applySortGroup(oEvent);
        },

        /**
         * Apply the chosen sorter and grouper to the list
         * @param {sap.ui.base.Event} oEvent the confirm event
         * @private
         */
        _applySortGroup: function (oEvent) {
            var mParams = oEvent.getParameters(),
                sPath,
                bDescending,
                aSorters = [];

            // apply sorter to binding
            // (grouping comes before sorting)
            if (mParams.groupItem) {
                sPath = mParams.groupItem.getKey();
                bDescending = mParams.groupDescending;
                var vGroup = this._oGroupFunctions[sPath];
                aSorters.push(new Sorter(sPath, bDescending, vGroup));
            }

            sPath = mParams.sortItem.getKey();
            bDescending = mParams.sortDescending;
            aSorters.push(new Sorter(sPath, bDescending));
            this._oList.getBinding("items").sort(aSorters);
        },

        /**
         * Event handler for the list selection event
         * @param {sap.ui.base.Event} oEvent the list selectionChange event
         * @public
         */
        onSelectionChange: function (oEvent) {
            var oList = oEvent.getSource(),
                bSelected = oEvent.getParameter("selected");

            // skip navigation when deselecting an item in multi selection mode
            if (!(oList.getMode() === "MultiSelect" && !bSelected)) {
                // get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
                this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
            }
        },

        /**
         * Event handler for the bypassed event, which is fired when no routing pattern matched.
         * If there was an object selected in the list, that selection is removed.
         * @public
         */
        onBypassed: function () {
            this._oList.removeSelections(true);
        },

        /**
         * Used to create GroupHeaders with non-capitalized caption.
         * These headers are inserted into the list to
         * group the list's items.
         * @param {Object} oGroup group whose text is to be displayed
         * @public
         * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
         */
        createGroupHeader: function (oGroup) {
            return new GroupHeaderListItem({
                title: oGroup.text,
                upperCase: false
            });
        },

        /**
         * Event handler for navigating back.
         * We navigate back in the browser history
         * @public
         */
        onNavBack: function () {
            // eslint-disable-next-line sap-no-history-manipulation
            history.go(-1);
        },

        /* =========================================================== */
        /* begin: internal methods                                     */
        /* =========================================================== */


        _createViewModel: function () {
            return new JSONModel({
                isFilterBarVisible: false,
                filterBarLabel: "",
                delay: 0,
                title: this.getResourceBundle().getText("listTitleCount", [0]),
                noDataText: this.getResourceBundle().getText("listListNoDataText"),
                sortBy: "OrderID",
                groupBy: "None"
            });
        },

        _onMasterMatched: function () {
            //Set the layout property of the FCL control to 'OneColumn'
            this.getModel("appView").setProperty("/layout", "OneColumn");
        },

        /**
         * Shows the selected item on the detail page
         * On phones a additional history entry is created
         * @param {sap.m.ObjectListItem} oItem selected Item
         * @private
         */
        _showDetail: function (oItem) {
            var bReplace = !Device.system.phone;
            // set the layout property of FCL control to show two columns
            this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
            this.getRouter().navTo("object", {
                objectId: oItem.getBindingContext().getProperty("OrderID")
            }, bReplace);
        },

        /**
         * Sets the item count on the list header
         * @param {integer} iTotalItems the total number of items in the list
         * @private
         */
        _updateListItemCount: function (iTotalItems) {
            var sTitle;
            // only update the counter if the length is final
            if (this._oList.getBinding("items").isLengthFinal()) {
                sTitle = this.getResourceBundle().getText("listTitleCount", [iTotalItems]);
                this.getModel("listView").setProperty("/title", sTitle);
            }
        },

        /**
         * Internal helper method to apply both filter and search state together on the list binding
         * @private
         */
        _applyFilterSearch: function () {
            var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
                oViewModel = this.getModel("listView");
            this._oList.getBinding("items").filter(aFilters, "Application");
            // changes the noDataText of the list in case there are no filter results
            if (aFilters.length !== 0) {
                oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("listListNoDataWithFilterOrSearchText"));
            } else if (this._oListFilterState.aSearch.length > 0) {
                // only reset the no data text to default when no new search was triggered
                oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("listListNoDataText"));
            }
        },

        /**
         * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
         * @param {string} sFilterBarText the selected filter value
         * @private
         */
        _updateFilterBar: function (sFilterBarText) {
            var oViewModel = this.getModel("listView");
            oViewModel.setProperty("/isFilterBarVisible", (this._oListFilterState.aFilter.length > 0));
            oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("listFilterBarText", [sFilterBarText]));
        },

        onPressAdd: function (oEvent) {

            var oView = this.getView();

            // create value help dialog
            if (!this._pAddDialog) {
                this._pAddDialog = Fragment.load({
                    id: oView.getId(),
                    name: "auro.eng.inv.testingapp.utils.fragment.AddDialog",
                    controller: this
                }).then(function (oAddDialog) {
                    oView.addDependent(oAddDialog);
                    return oAddDialog;
                });
            }

            // open value help dialog

            this._pAddDialog.then(function (oAddDialog) {
                oAddDialog.open();
            });

        },

        // escape Handler

        onEscapeHandler: function (oEvent) {

            var oView = this.getView();
            var that = this;
            // sap.m.MessageBox.waring("pl do needful");
            MessageBox.error("Product A does not exist.", {
                actions: ["Manage Products", MessageBox.Action.CLOSE],
                emphasizedAction: "Manage Products",
                onClose: function (sAction) {
                    // MessageToast.show("Action selected: " + sAction);
                    this.whenClose(sAction);
                }.bind(this)
            });

            // if (!this.oConfirmEscapePreventDialog) {
            //     this.oConfirmEscapePreventDialog = Fragment.load({
            //         id: oView.getId(),
            //         name: "auro.eng.inv.testingapp.utils.fragment.EscapeDialog",
            //         controller: this
            //     }).then(function (oEscapeHandlerDialog) {
            //         oView.addDependent(oEscapeHandlerDialog);
            //         return oEscapeHandlerDialog;
            //     });
            // }

            // this.oConfirmEscapePreventDialog.then(function (oEscapeHandlerDialog) {
            //     oEscapeHandlerDialog.open();
            // });
        },

        whenClose: function (sAction) {
            switch (sAction) {
                case "CLOSE":
                    sap.m.MessageToast.show("We Are Closing this Action " + sAction, {
                        autoClose: false
                    });
                case "Manage Products":
                    sap.m.MessageToast.show("pl enter Message Content " + sAction);
                default:
                    return;
            }


        },

        onEscapeButton: function () {
            this.oConfirmEscapePreventDialog.then(function (oEscapeHandlerDialog) {
                oEscapeHandlerDialog.close();
            });
        },

        onCloseDialog: function (oEvent) {
            this._pAddDialog.then(function (oAddDialog) {
                oAddDialog.close();
            });
        },

        onValueHelpRequest: function (oEvent) {

            var sInputValue = oEvent.getSource().getValue(),
                oView = this.getView();

            if (!this._pValueHelpDialog) {
                this._pValueHelpDialog = Fragment.load({
                    id: oView.getId(),
                    name: "auro.eng.inv.testingapp.utils.fragment.ValueHelp",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pValueHelpDialog.then(function (oDialog) {
                // Create a filter for the binding
                oDialog.getBinding("items").filter([new Filter("CustomerID", FilterOperator.Contains, sInputValue)]);
                // Open ValueHelpDialog filtered by the input's value
                oDialog.open(sInputValue);
            });

        },

        onValueHelpSearch: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oFilter = new Filter("CustomerID", FilterOperator.Contains, sValue);

            oEvent.getSource().getBinding("items").filter([oFilter]);
        },

        onValueHelpClose: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            oEvent.getSource().getBinding("items").filter([]);

            if (!oSelectedItem) {
                return;
            }

            this.byId("customerInput").setValue(oSelectedItem.getTitle());
            this.byId("customerInput").setValueState("None");
            this.byId("customerInput").setValueStateText("");

        },
        onSaveDialog: function (oEvent) {
            var oIpCustomer = this.getView().byId("customerInput"),
                sCustomer = oIpCustomer.getValue();
            var oIpZipCode = this.getView().byId("idZipCode"),
                sZipCode = oIpZipCode.getValue();
            var oIpEmail = this.getView().byId("idEmail"),
                sEmailValue = oIpEmail.getValue();
            // var sRegExpr = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
            var bEmailValid = this.onEmailValidation(sEmailValue);
            // if (!bEmailValid) {
            //     MessageBox.error("Invalid email id");
            // }
            if (sZipCode === "") {
                oIpZipCode.setValueState("Error");
                oIpZipCode.setValueStateText("ZipCode is Mandatory");
            } else {
                oIpZipCode.setValueState("None");
                oIpZipCode.setValueStateText("");
            }
            if (sCustomer === "") {
                oIpCustomer.setValueState("Error");
                oIpCustomer.setValueStateText("Customer Id is Mandatory");
            } else {
                oIpCustomer.setValueState("None");
                oIpCustomer.setValueStateText("");
            }
            if (sCustomer === "" || sZipCode === "") {
                MessageBox.error("Pl enter all mandatory fields");
                return
            }
            if (!bEmailValid) {
                MessageBox.error("Invalid email id entered, pl check");
                oIpEmail.setValueState("Error");
                return
            }
            this.onCloseDialog();
        },
        onSuggSelected: function (oEvent) {
            this.byId("customerInput").setValueState("None");
            this.byId("customerInput").setValueStateText("");
            this.byId("idZipCode").setValueState("None");
            this.byId("idZipCode").setValueStateText("");
        },
        onLiveChangIpCustom: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var sRegex = /^[a-z]{0,9}$/;
            if (!sRegex.test(sValue)) {
                oEvent.getSource().setValue(oEvent.getSource()._sTypedInValue);
            }
        },
        onLiveChangeIpZip: function (oEvent) {
            var iValue = oEvent.getParameter("value");
            var regex = /^[0-9]{0,3}$/;
            if (!regex.test(iValue)) {
                oEvent.getSource().setValue(oEvent.getSource()._sTypedInValue);
            }
            // var value = oEvent.getSource().getValue();
            //     var regexp = /^[0-9]{0,4}.?[0-9]{0,5}$/            
            //     var bNotnumber = isNaN(value);
            //     if (bNotnumber === true) {
            //         // oEvent.getSource().setValue(value.substring(0, value.length - 1));
            //         if(oEvent.getSource()._sTypedInValue){
            //             oEvent.getSource().setValue(oEvent.getSource()._sTypedInValue);
            //         }else {
            //             oEvent.getSource().setValue("");
            //         }
            //     } else {
            //         if(value.includes("e")){
            //             oEvent.getSource().setValue(oEvent.getSource()._sTypedInValue);
            //             return;
            //         }
            //         if (value.split(".")[0].length <= 4) {
            //             if (!regexp.test(Number(value))) {
            //                 oEvent.getSource().setValue(value.substring(0, value.length - 1));
            //             }
            //         } else {
            //             var sOldVal = oEvent.getSource()._sTypedInValue !== "" ? oEvent.getSource()._sTypedInValue : oEvent.getSource()._sTypedInValue;
            //             oEvent.getSource().setValue(sOldVal);
            //         }

            //     }
        },
        onSubmit: function (oEvent) {
            var oInpEmail = this.getView().byId("idEmail");
            var sEmailValue = oEvent.getParameter("value");
            var bValid = this.onEmailValidation(sEmailValue);
            if (!bValid) {
                MessageBox.error("Invalid email id");
                oInpEmail.setValueState("Error");
            }
        },
        onEmailValidation: function (sEmail) {
            var sRegExp = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
            // if (sRegExp.test(sEmail) === false) {
            //     // MessageBox.error("Invalid email id");
            //     return false;
            // } else {
            //     return true
            // }
            return sRegExp.test(sEmail);
        },
        onCBClicked: function (oEvent) {
            this.oCheckBoxModel = new JSONModel({
                child1: true,
                child2: true,
                child3: true
            });
            this.getView().setModel(this.oCheckBoxModel, "cbModel");
            var bSelected = oEvent.getParameter("selected");
            this.getView().getModel("cbModel").setData({ child1: bSelected, child2: bSelected, child3: bSelected });
        },
        onSelectRadio: function (oEvent) {
            if (oEvent.getParameter("id").includes("groupA")) {
                this.getView().byId("groupB").setSelectedIndex(-1);
            } else {
                this.getView().byId("groupA").setSelectedIndex(-1);
            }
        },
        onAdd: function (oEvent) {
            this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
            this.getRouter().navTo("product");
        }
    });
});