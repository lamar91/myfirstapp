sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"   
], function (BaseController, JSONModel, MessageBox, MessageToast) {
    "use strict";
    return BaseController.extend("auro.eng.inv.testingapp.controller.PayLoad", {      
        onInit: function () {
            // var oLocalModel = new JSONModel();
            // oLocalModel.setData({
            //     "productData": {
            //         "ProductID": "",
            //         "ProductName": "Chai",
            //         "SupplierID": "",
            //         "CategoryID": "",
            //         "QuantityPerUnit": "10 boxes x 20 bags",
            //         "UnitPrice": "",
            //         "UnitsInStock": 39,
            //         "UnitsOnOrder": 0,
            //         "ReorderLevel": 10,
            //         "Discontinued": false
            //     }
            // });
            // this.getView().setModel(oLocalModel,"local");
        },
        onPaySave:function(oEvent){
            var oDataModel=this.getView().getModel();
            var payLoad=this.getView().getModel("local").getProperty("/productData");
            oDataModel.create("/Products",payLoad,{
            success:function(data){
                MessageToast.show("The product is created succesfully");
            },
            error:function(oErr){
                MessageBox.error("pl check ProductData");
            }
            });
        }
    });
});