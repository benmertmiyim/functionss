require('dotenv').config();

const geohash = require('ngeohash');
const functions = require("firebase-functions");
const admin = require('firebase-admin');
const Iyzipay = require('iyzipay');

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

var iyzipay = new Iyzipay({
    apiKey: process.env.APIKEY,
    secretKey: process.env.SECRETKEY,
    uri: process.env.URI,
});

var db = admin.firestore();

exports.delCard = functions.https.onRequest(async (req, res) => {
    try{
        const { cardUserKey, cardToken} = req.body;

        if(!cardUserKey || !cardToken) return res.status(400).send({message: "Lütfen tüm alanları doldurunuz.",status:"error"});

        iyzipay.card.delete({
            locale: Iyzipay.LOCALE.TR,
            cardToken: cardToken,
            cardUserKey: cardUserKey,
        }, function (err, result) {
            if (err) {
                return res.send(err);
            } else {
                return res.send(result);
            }
        });
    }catch(error){
        return res.status(400).send({message: "Bir hata oluştu.",status:"error"});
    }
});

exports.pay = functions.https.onRequest(async (req, res) => {
    try{
        const { price, cardUserKey, cardToken, uid, name, surname, gsmNumber, email, identityNumber, address, ip, city, country, vendorId, requestId, couponId, couponPrice, density } = req.body;

        if(!price || !cardUserKey || !cardToken || !uid || !name || !surname || !gsmNumber || !email || !identityNumber || !address || !ip || !city || !country || !vendorId || !requestId || !density){
            res.status(400).send({message: "Lütfen tüm alanları doldurunuz.",status:"error"});
            return;
        }

        var request = {
            locale: Iyzipay.LOCALE.TR,
            price: price,
            paidPrice: price,
            currency: Iyzipay.CURRENCY.TRY,
            installment: '1',
            paymentChannel: Iyzipay.PAYMENT_CHANNEL.MOBILE,
            paymentCard: {
                cardUserKey: cardUserKey,
                cardToken: cardToken,
            },
            buyer: {
                id: uid,
                name: name,
                surname: surname,
                gsmNumber: gsmNumber,
                email: email,
                identityNumber: identityNumber,
                registrationAddress: address,
                ip: ip,
                city: city,
                country: country,  
            },
            shippingAddress: {
                contactName: name + surname,
                city: city,
                country: country,  
                address: address,
            },
            billingAddress: {
                contactName: name + surname,
                city: city,
                country: country,  
                address: address,
            },
            basketItems: [
                {
                    id: 'park_odeme_id',
                    name: 'Park Ödeme',
                    category1: 'Hizmet',
                    itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
                    price: price
                }
            ]
        };

        function createPayment() {
            return new Promise((resolve, reject) => {
                iyzipay.payment.create(request, function (err, result) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });
        }

        let payment = await createPayment();

        if(payment.status == "success"){
            let currentTime = new Date();

            let newRequest = {
                status: "completed",
                paymentId: payment.paymentId,
                ip: ip,
                paymentCompletedTime: currentTime,
            };

            let newDensity = {
                density: density,
                customerId: uid,
                densityTime: currentTime,
            };

            if(couponId != null && !couponPrice != null){
                newRequest.couponId = couponId;
                newRequest.couponPrice = couponPrice;
                newRequest.totalPrice = price;
                await db.collection('customer/' + uid + '/coupon').doc(couponId).delete();
            }
        
            await db.collection('customer/' + uid + '/history').doc(requestId).update(newRequest);
            await db.collection('vendor/' + vendorId + '/history').doc(requestId).update({paymentId: payment.paymentId, paymentCompleted: true});
            await db.collection('vendor/' + vendorId + '/density').add(newDensity);
            return res.status(200).send(payment);
        }else{
            return res.status(400).send(payment);
        }

    }catch(error){
        return res.status(400).send({message: "Bir hata oluştu." + error ,status:"error"});
    }
});

exports.getCards = functions.https.onRequest(async (req, res) => {
    try{
        const { cardUserKey } = req.body;

        if(!cardUserKey) return res.status(400).send({message: "Lütfen tüm alanları doldurunuz.",status:"error"});
        
        iyzipay.cardList.retrieve({
            locale: Iyzipay.LOCALE.TR,
            cardUserKey: cardUserKey,
        }, function (err, result) {
            if (err) {
                return res.status(400).send(err);
            } else {
                return res.status(200).send(result);
            }
        });
    }catch(error){
        return res.status(400).send({message: "Bir hata oluştu.",status:"error"});
    }
});

exports.regCard = functions.https.onRequest(async (req, res) => {
    try{
        const { email, cardUserKey, cardAlias, cardHolderName, cardNumber, expireMonth, expireYear } = req.body;

        if(!email || !cardAlias || !cardHolderName || !cardNumber || !expireMonth || !expireYear){
            res.status(400).send({message: "Lütfen tüm alanları doldurunuz.",status:"error"});
            return;
        }

        iyzipay.card.create({
            locale: Iyzipay.LOCALE.TR,
            email: email,
            cardUserKey: cardUserKey,
            card: {
                cardAlias: cardAlias,
                cardHolderName: cardHolderName,
                cardNumber: cardNumber,
                expireMonth: expireMonth,
                expireYear: expireYear
            }
        }, function (err, result) {
            if (err) {
                return res.status(400).send(err);
            } else {
                return res.status(200).send(result);
            }
        });

    }catch(error){
        return res.status(400).send({message: "Bir hata oluştu.",status:"error"});
    }
    
});

exports.rateVendor = functions.https.onRequest(async (req, res) => {
    try{
        const { security, serviceQuality, accessibility, customerId, vendorId, requestId, comment } = req.body;

        if(!security || !serviceQuality || !accessibility || !customerId || !vendorId || !requestId){
            res.status(400).send({message: "Lütfen tüm alanları doldurunuz.",status:"error"});
            return;
        }

        let newRating = {
            security: security,
            serviceQuality: serviceQuality,
            accessibility: accessibility,
            customerId: customerId,
            vendorId: vendorId,
            requestId: requestId,
            commentDate: new Date(),
            comment: comment,
        };

        await db.collection('vendor/' + vendorId + '/rating').add(newRating);
        await db.collection('customer/' + customerId + '/history').doc(requestId).update({rated: true});

        return res.status(200).send({message: "Başarıyla değerlendirildi.",status:"success"});
    }catch(error){
        return res.status(400).send({message: "Bir hata oluştu.",status:"error"});
    }
    
});

exports.rating = functions.firestore.document('vendor/{vendorId}/rating/{ratingId}').onWrite( async (change, context) => {
        let totalSecurity = 0;
        let totalAccessibility = 0;
        let totalServiceQuality = 0;
        let count = 0;

        let path = 'vendor/' + context.params.vendorId + '/rating';
        let collecRef = db.collection(path);
        await collecRef.get().then(snapshot => {
            snapshot.forEach(doc => {
                let document = doc.data();
                totalSecurity += document.security;
                totalAccessibility += document.accessibility;
                totalServiceQuality += document.serviceQuality;
                count += 1;
            });
        }).catch(err => {
            console.log('Error getting documents', err);
        });
        if(count != 0){
            totalAccessibility = totalAccessibility / count;
            totalSecurity = totalSecurity / count;
            totalServiceQuality = totalServiceQuality / count;
        }
        let rating = (totalAccessibility + totalSecurity + totalServiceQuality) / 3;
        
        let vendorRef = db.collection('vendor').doc(context.params.vendorId);
        vendorRef.update({"security":totalSecurity,"accessibility":totalAccessibility,"serviceQuality":totalServiceQuality,"rating":rating});
        return null;
});

exports.createCustomer = functions.firestore.document('customer/{customerId}').onCreate( async (change, context) => {
    let createdAt = new Date();
    let validDate = new Date();

    validDate.setDate(createdAt.getDate() + 10);

    db.collection('customer').doc(context.params.customerId).update({
      "createdAt" : createdAt,
    });
    var coupon = await db.collection("customer/"+context.params.customerId + "/coupon").add({
        "code" : "HOSGELDIN",
        "price" : 10,
        "used" : false,
        "createdAt" : createdAt,
        "title" : "Hoşgeldin Kuponu",
        "description" : "Hoşgeldin kuponu ile 10 TL indirim kazanabilirsiniz.",
        "validDate" : validDate,
    });
    db.collection("customer/" + context.params.customerId + "/coupon").doc(coupon.id).update({
        "id" : coupon.id,
    });
    var notification = await db.collection("customer/" + context.params.customerId + "/notification").add({
        "title" : "Hoşgeldin",
        "message" : "HerYerPark'a hoşgeldiniz. Hoşgeldin kuponu ile 10 TL indirim kazanabilirsiniz. Kuponunuzun geçerlilik süresi 10 gündür. Kuponu kullanmak için profil sayfanızdan kuponlarınıza bakabilirsiniz.",
        "sentDate" : createdAt,
    });
    db.collection("customer/" + context.params.customerId + "/notification").doc(notification.id).update({
        "id" : notification.id,
    });
    return null;
});

exports.addVendor = functions.https.onRequest(async (req, res) => {
    try {
        const { address, iban, latitude, longitude, parkName, vkn, employeeNameSurname, employeePhoneNumber, employeeEmail, commissionRate } = req.body;
        let userRecord;

        if(!address || !iban || !latitude || !longitude || !parkName || !vkn || !employeeNameSurname || !employeePhoneNumber || !employeeEmail){
            res.status(400).send({message: "Lütfen tüm alanları doldurunuz.",status:"error"});
            return;
        }

        try {
            userRecord = await admin.auth().getUserByEmail(employeeEmail);
        } catch (error) {
            userRecord = await admin.auth().createUser({
                email: employeeEmail,
                password: "123456",
                displayName: employeeNameSurname,
                phoneNumber: employeePhoneNumber,
            });
        }
        const hash = geohash.encode(latitude, longitude);

        let vendorRef = await db.collection('vendor').add({
            "active": false,
            "imgList": ['https://firebasestorage.googleapis.com/v0/b/heryerpark-ms.appspot.com/o/vendorImage%2Fdefaultpark.jpg?alt=media&token=e156a34e-2bfe-4f7b-a240-1f827e43ef57'],
            "price": [{ "timeRange": [0, 1], "price": 10 }, { "timeRange": [1, 2], "price": 15 }, { "timeRange": [2, 3], "price": 20 }, { "timeRange": [3], "price": 25 }],
            "accessibility": 5,
            "rating": 5,
            "security": 5,
            "serviceQuality": 5,
            "address": address,
            "iban": iban,
            "latitude": latitude,
            "longitude": longitude,
            "parkName": parkName,
            "vkn": vkn,
            "openTime": "09:00",
            "closeTime": "18:00",
            "commissionRate": commissionRate,
            "geohash": hash,
            "kdvRate": 0.18,
            "createdAt": new Date(),
        });

        await vendorRef.update({
            "vendorId": vendorRef.id,
        });

        let employeeRef = db.collection('employee').doc(userRecord.uid);
        let employeeDoc = await employeeRef.get();

        if (!employeeDoc.exists) {
            await employeeRef.set({
                "employeeId": userRecord.uid,
                "employeeEmail": userRecord.email,
                "employeeNameSurname": employeeNameSurname,
                "employeePhoneNumber": employeePhoneNumber,
                "createdAt": new Date(),
                "verified": false,
                "employeeImage": "",
            });
        }

        await employeeRef.collection('vendor').doc(vendorRef.id).set({
            "vendorId": vendorRef.id,
            "permission": "owner",
            "createdAt": new Date(),
        });

        let path = 'vendor/' + vendorRef.id + '/employee';

        await db.collection(path).doc(userRecord.uid).set({
            "employeeId": userRecord.uid,
            "permission": "owner",
            "createdAt": new Date(),
        });
        
        res.status(201).json({
            message: "Vendor added successfully",
            vendorId: vendorRef.id,
            employeeId: userRecord.uid,
            status: "success",
        });
    } catch (error) {
        res.status(500).json({
            message: error.message,
            status: "error",
        });
    }
});

exports.vendorToCustomer = functions.https.onRequest(async (req, res) => {
    try {
        const customerEmail = req.body.customerEmail;

        if(!customerEmail) return res.status(400).json({
            message: "Customer email is required",
            status: "error",
        });

        const user = await admin.auth().getUserByEmail(customerEmail);
        if (user) {
            const customerData = {
                uid: user.uid,
                cardUserKey: "",
                email: customerEmail,
                customerImage: "",
                nameSurname: user.displayName,
                phone: user.phoneNumber,
                verified: false,
            };
            await db.collection('customer').doc(user.uid).set(customerData);
            return res.status(201).json({
                message: "Customer added successfully",
                status: "success",
            });
        }
        return res.status(404).json({
            message: "User not found",
            status: "error",
        });
    } catch (e) {
        return res.status(500).json({
            message: e.message,
            status: "error",
        });
    }
});

exports.sendVerificationCode = functions.https.onRequest(async (req, res) => {
    try {
        const phoneNumber = req.body.phoneNumber;
        const customerId = req.body.customerId;
        const isEmployee = req.body.isEmployee;

        if(!customerId || !phoneNumber || isEmployee == null) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // validate phone number
        //if (!validatePhoneNumber(phoneNumber)) {
        //    return res.status(400).json({ message: 'Invalid phone number format' });
        //}

        // generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const collection = isEmployee ? 'employee' : 'customer';
        // Save the verification code to the user's document
        await db.collection(collection).doc(customerId).update({
            "verificationCode": verificationCode
        });

        // Send the verification code via SMS
        //sendSMS(phoneNumber, verificationCode);

        res.status(201).json({
            message: 'Verification code sent',
            code: verificationCode,
            status:"success"
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error sending verification code: ' + error,
            status:"error"
        });
    }
});

exports.verifyCode = functions.https.onRequest(async (req, res) => {
    try {
        const customerId = req.body.customerId;
        const verificationCode = req.body.verificationCode;
        const isEmployee = req.body.isEmployee;
        
        // Validate user inputs
        if (!customerId || !verificationCode || typeof isEmployee !== 'boolean') {
            return res.status(400).json({
                message: 'Missing required fields',
                status:"error"
            });
        }

        // Determine the user type and query the appropriate collection
        const collection = isEmployee ? 'employee' : 'customer';
        const user = await db.collection(collection).doc(customerId).get();
        
        // If user not exists
        if (!user.exists) {
            return res.status(404).json({
                message: 'User not found',
                status:"error"
            });
        }
        // Compare the provided verification code with the code stored in the database
        const code = user.data()["verificationCode"];
        if (code === verificationCode) {
            // Update the user's verified status and clear the verification code
            await db.collection(collection).doc(customerId).update({
                "verified": true,
                "verificationCode": ""
            });

            res.status(201).json({
                message: 'Verification completed',
                status:"success"
            });
        } else {
            res.status(401).json({
                message: 'Verification code is not correct',
                status:"error"
            });
        }
    } catch (error) {
        res.status(500).json({
            message: 'Error verifying code: ' + error,
            status:"error"
        });
    }
});

exports.getEmployee = functions.https.onRequest(async (req, res) => {
    try {
        let employeeId = req.body.employeeId;
        if(!employeeId){ 
            return res.status(400).json({
                message: 'Missing required fields',
                status:"error"
            });
        }
        let employeeRef = db.collection('employee').doc(employeeId);
        let employee = await employeeRef.get();
        if (employee.exists) {
            let employeeData = employee.data();
            let vendorRef = employeeRef.collection('vendor');
            let vendorSnapshot = await vendorRef.get();
            let result = [];
            for (const doc of vendorSnapshot.docs) {
                let vendorId = doc.data().vendorId;
                let permission = doc.data().permission;
                let vendorRef = db.collection("vendor").doc(vendorId);
                let vendor = await vendorRef.get();
                if (vendor.exists) {
                    let vendorData = vendor.data();
                    let vendorInfo = {
                        permission: permission,
                        vendorId: vendorId,
                        parkName: vendorData.parkName,
                        active: vendorData.active,
                        address: vendorData.address
                    }
                    result.push(vendorInfo);
                }
            }
            employeeData.vendors = result;
            res.status(200).send(employeeData);
        } else {
            res.status(404).send({ message: 'Employee not found' , status:"error"});
        }
    } catch (error) {
        res.status(500).send({ message: 'Error getting employee: ' + error , status:"error"});
    }
});

exports.sendRequest = functions.https.onRequest(async (req, res) => {
    try {
        const { employeeId, vendorId, customerCode } = req.body;

        if (!employeeId || !vendorId || !customerCode) return res.status(400).send({ message: 'Missing required fields', status:"error"});

        let vendorDoc = await db.collection('vendor').doc(vendorId).get();
        if (!vendorDoc.exists) return res.status(404).send({ message: 'Vendor not found' , status:"error"});

        let employeeDoc = await db.collection('employee').doc(employeeId).get();
        if (!employeeDoc.exists) return res.status(404).send({ message: 'Employee not found', status:"error" });

        let requestMode = customerCode.includes("-");

        let code;
        let customerId;
        let requestId;
        let currentTime = new Date();

        if(requestMode) {
            code = customerCode.split("-")[0];
            customerId = customerCode.split("-")[1];

            let customerDoc = await db.collection('customer').doc(customerId).get();
            if (!customerDoc.exists) return res.status(404).send({ message: 'Customer not found' });
            let customer = customerDoc.data();

            let expiredDate = customer["codeTime"].toDate();

            if(customer["code"] != code) return res.status(401).send({ message: 'Customer code is not correct', status:"error" });
            if(expiredDate.getTime() < currentTime.getTime()) return res.status(401).send({ message: 'Customer code is expired', status:"error" });

            const customerAprovalQueryRef = db.collection('customer/' + customerId + "/history").where("status", "in", ['approval', 'process']);
            const approval = await customerAprovalQueryRef.get();
            if(!approval.empty) return res.status(401).send({ message: 'Customer has a request or process.', status:"error" });

            let customerHistoryCol = db.collection('customer/' + customerId + "/history");
            let vendorHistoryCol = db.collection('vendor/' + vendorId + "/history");

            let newRequest = {
                "requestTime": currentTime,
                "customerImage": customer["customerImage"],
                "customerName": customer["nameSurname"],
                "customerId": customerId,
                "price": vendorDoc.data()["price"],
                "vendorId": vendorId,
                "parkName": vendorDoc.data()["parkName"],
                "status": "approval",
                "employeeId": employeeId,
                "employeeNameSurname": employeeDoc.data()["employeeNameSurname"],
                "employeeImage": employeeDoc.data()["employeeImage"],
            }

            let requestRef = await vendorHistoryCol.add(newRequest);
            await vendorHistoryCol.doc(requestRef.id).update({ "requestId": requestRef.id });
            newRequest["requestId"] = requestRef.id;
            await customerHistoryCol.doc(requestRef.id).set(newRequest);

            res.status(201).send({ message: 'Request sent' , requestId: requestRef.id, status:"success"});

        }else{
            requestId = customerCode;
            
            let vendorHistoryCol = db.collection('vendor/' + vendorId + "/history").doc(requestId);
            let vendorHistory = await vendorHistoryCol.get();
            if (!vendorHistory.exists) return res.status(404).send({ message: 'Request not found' , status:"error"});
            let vendorHistoryData = vendorHistory.data();

            let customerHistoryCol = db.collection('customer/' + vendorHistoryData["customerId"] + "/history").doc(requestId);
            let customerHistory = await customerHistoryCol.get();
            if (!customerHistory.exists) return res.status(404).send({ message: 'Request not found' , status:"error"});
            let customerHistoryData = customerHistory.data();

            if(vendorHistoryData.status == "process" && customerHistoryData.status == "process") {
                //calculate time
                let requestTime = vendorHistoryData.requestTime.toDate();
                var difference = currentTime.getTime() - requestTime.getTime();
                var minutesDifference = Math.floor(difference/1000/60);
                var hoursDifference = Math.floor(difference/1000/60/60);

                //calculate price
                let price = vendorHistoryData.price;
                let totalPrice = price.find((item) => {
                    return hoursDifference >= item.timeRange[0] && hoursDifference < item.timeRange[1];
                }).price;

                let newRequest = {
                    "totalMins": minutesDifference,
                    "totalPrice": totalPrice,
                    "status": "payment",
                    "closedTime": currentTime,
                    "paymentId": null,
                    "closedBy": employeeId,
                    "rated": false,
                }

                await customerHistoryCol.update(newRequest);

                let commissionRate = vendorDoc.data()["commissionRate"];
                let kdvRate = vendorDoc.data()["kdvRate"];
                delete newRequest['rated'];

                let commission = totalPrice * commissionRate;
                let kdv = commission * kdvRate;
                let commissionWithKdv = commission + kdv;
                let allowance = totalPrice - commissionWithKdv;

                newRequest.allowance = allowance;
                newRequest.commission = commission;
                newRequest.commissionWithKdv = commissionWithKdv;
                newRequest.kdv = kdv;
                newRequest.status = "completed";
                newRequest.allowanceCompleted = false;
                newRequest.paymentCompleted = false;

                await vendorHistoryCol.update(newRequest);

                return res.status(201).send({ message: 'Request completed' , status:"success"});
            }else{
                return res.status(401).send({ message: 'The request has already been closed.', status:"error" });
            }
            
        }
    } catch (error) {
        return res.status(500).send({ status:"error", message: 'Error sending request: ' + error });
    }
});

exports.replyRequest = functions.https.onRequest(async (req, res) => {
    try{
        const { customerId, vendorId, requestId, reply } = req.body;

        if(!customerId || !vendorId || reply == null || !requestId) return res.status(400).send({ message: 'Missing required fields', status:"error"});

        let customerHistoryCol = db.collection('customer/' + customerId + "/history");
        let vendorHistoryCol = db.collection('vendor/' + vendorId + "/history");

        let customerHistoryRef = customerHistoryCol.doc(requestId);
        let vendorHistoryRef = vendorHistoryCol.doc(requestId);

        let customerHistoryDoc = await customerHistoryRef.get();
        let vendorHistoryDoc = await vendorHistoryRef.get();

        if (!customerHistoryDoc.exists) return res.status(404).send({ message: 'Request not found' , status:"error"});
        if (!vendorHistoryDoc.exists) return res.status(404).send({ message: 'Request not found' , status:"error"});
        let mapCustomer = customerHistoryDoc.data();

        if(mapCustomer["status"] != "approval") return res.status(400).send({ message: 'Request is not in approval' , status:"error"});

        let newRequest = {};
        let currentTime = new Date();
        
        if(reply){
            newRequest = {
                "status": "process",
                "replyTime": currentTime,
            }
        }else{
            newRequest = {
                "status": "denied",
                "replyTime": currentTime,
                "closedTime": currentTime,
            }
        }
        await vendorHistoryRef.update(newRequest);
        await customerHistoryRef.update(newRequest);
        return res.status(200).send({ message: 'Request accepted' , status:"success"});
    }catch(error){
        return res.status(500).send({ status:"error", message: 'Error replying request: ' + error });
    }
});

exports.generateCode = functions.https.onRequest(async (req, res) => {
    try{
        const {customerId} = req.body;

        if(!customerId) return res.status(400).send({ message: 'Customer id is required' , status:"error"});

        const [customerDoc] = await Promise.all([
            db.collection('customer').doc(customerId).get(),
        ]);

        if (!customerDoc.exists) return res.status(404).send({ message: 'Customer not found' , status:"error"});

        let code = Math.floor(100000 + Math.random() * 900000);
        
        let currentTime = new Date();
        let expiredDate = new Date(currentTime.getTime() + 5*60000);

        let newCode = {
            "code": code,
            "codeTime": expiredDate ,
        }

        await db.collection('customer').doc(customerId).update(newCode);
        res.status(200).send({ message: 'Code generated', code: code , status: "success",codeTime: expiredDate,});
    }catch(error){
        res.status(500).send({ message: 'Error generating code: ' + error , status: "error"});
    }
});

function distance(lat1, lon1, lat2, lon2) {
	if ((lat1 == lat2) && (lon1 == lon2)) {
		return 0;
	}
	else {
		var radlat1 = Math.PI * lat1/180;
		var radlat2 = Math.PI * lat2/180;
		var theta = lon1-lon2;
		var radtheta = Math.PI * theta/180;
		var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
		if (dist > 1) {
			dist = 1;
		}
		dist = Math.acos(dist);
		dist = dist * 180/Math.PI;
		dist = dist * 60 * 1.1515 * 1.609344;
		return dist;
	}
}

exports.getVendor = functions.https.onRequest(async (req, res) => {
    try{
        const {vendorId} = req.body;

        if(!vendorId) return res.status(400).send({ message: 'VendorId id is required' , status:"error"});

        let densityTimeCalculate = new Date();
        densityTimeCalculate.setHours(densityTimeCalculate.getHours() - 4);

        const [vendorDoc, densityCol] = await Promise.all([
            db.collection('vendor').doc(vendorId).get(),
            db.collection('vendor/' + vendorId + "/density").where("densityTime", ">=", densityTimeCalculate).get(),
        ]);

        if (!vendorDoc.exists) return res.status(404).send({ message: 'Vendor not found' , status:"error"});

        let vendorData = vendorDoc.data();
        let densityData = densityCol.docs.map(doc => doc.data());

        let density = 0;
        let densityCount = 0;
        
        densityData.forEach(element => {
            density += element.density;
            densityCount++;
        });

        density = density / densityCount;
        vendorData.density = density;

        delete vendorData["commissionRate"];
        delete vendorData["kdvRate"];
        delete vendorData["createdAt"];
        delete vendorData["iban"];
        delete vendorData["vkn"];

        res.status(200).send(vendorData);
    }catch(error){
        res.status(500).send({ message: 'Error getting vendor: ' + error , status: "error"});
    }
});

const getGeohashRange = (
    latitude,
    longitude,
    distance,
  ) => {
    const lat = 0.0144927536231884;
    const lon = 0.0181818181818182;
  
    const lowerLat = latitude - lat * distance;
    const lowerLon = longitude - lon * distance;
  
    const upperLat = latitude + lat * distance;
    const upperLon = longitude + lon * distance;
  
    const lower = geohash.encode(lowerLat, lowerLon);
    const upper = geohash.encode(upperLat, upperLon);
  
    return {
      lower,
      upper
    };
};

exports.getNearVendor = functions.https.onRequest(async (req, res) => {
    try {
        const { latitude, longitude, radius, limit } = req.body;

        async function convertData(doc) {
            let data = doc.data();

            let densityTimeCalculate = new Date();
            densityTimeCalculate.setHours(densityTimeCalculate.getHours() - 4);

            let densityCol = await db.collection('vendor/' + data.vendorId + "/density").where("densityTime", ">=", densityTimeCalculate).get();

            let densityData = densityCol.docs.map(doc => doc.data());

            let density = 0;
            let densityCount = 0;

            densityData.forEach(element => {
                density += element.density;
                densityCount++;
            });

            density = density / densityCount;
            data.density = density;
            data.distance = distance(latitude, longitude, data.latitude, data.longitude);

            delete data["commissionRate"];
            delete data["kdvRate"];
            delete data["createdAt"];
            delete data["iban"];
            delete data["vkn"];

            return data;
        }

        const range = getGeohashRange(latitude, longitude, radius);

        let snapshot;

        if (limit != null) {
            snapshot = await db.collection("vendor")
            .where("geohash", ">=", range.lower)
            .where("geohash", "<=", range.upper).limit(limit)
            .get();
        } else {
            snapshot = await db.collection("vendor")
            .where("geohash", ">=", range.lower)
            .where("geohash", "<=", range.upper)
            .get();
        }
        let data = [];

        for (const doc of snapshot.docs) {
            const vendorData = await convertData(doc);
            data.push(vendorData);
        }

        return res.status(200).send(data);
    } catch (error) {
        return res.status(500).send({ message: 'Error getting vendor: ' + error, status: "error" });
    }

});
