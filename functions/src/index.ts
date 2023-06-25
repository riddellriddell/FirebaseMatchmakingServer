import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as cors from "cors";

// // Start writing functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });


// import * as cryptogrpahy from 'crypto'

// setup es lint rules
/* eslint-disable */
/* eslint brace-style: ["error", "allman", { "allowSingleLine": true }]*/
/* eslint brace-style: ["error", "allman", { "allowSingleLine": true }]*/


admin.initializeApp();
const corsHandler = cors({origin: true});

// tool for tracking version changes on the server
function ApiVersionNumber():string
{
    // major versions, minor versions, patch no
    return '00.01.00';
}

function UniformBitRandLong():number
{
    let randomID:number = 0;

    //make sure the random id is never 0
    while(randomID === 0)
    {
        randomID = Math.floor(((Math.random() - 0.5)  * Number.MAX_SAFE_INTEGER * 2));
    }

    return randomID;
}

function SetupNewPeer(adrUserKey : admin.database.Reference, lUserKey : number): Promise<void>
{
    const PromiseArray = [];

    //the time of the last activity
    PromiseArray.push(adrUserKey.child('m_dtmLastActivity').set(admin.database.ServerValue.TIMESTAMP));
    PromiseArray.push(adrUserKey.child('m_lUserKey').set(lUserKey));

    return Promise.all(PromiseArray).then();
}

function SetupNewUdidMapping(UdidKey : admin.database.Reference, lUserID :number, lUserKey : number): Promise<void>
{
    const PromiseArray = [];

    //the time of the last activity
    PromiseArray.push(UdidKey.child('m_lUserID').set(lUserID));
    PromiseArray.push(UdidKey.child('m_lUserKey').set(lUserKey));

    return Promise.all(PromiseArray).then();
}

export const GetApiVersionNumber = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        console.log(request.body);

        response.status(200).json({                  
            m_strApiNumber: ApiVersionNumber()
        });
    });
});

export const DumpAllDataInDatabase = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        console.log(request.body);

        //get all gateways
        const adrAllDatabaseData = admin.database().ref('');

        //const iDataCount:number = adrAllDatabaseData.

        response.status(200).json(adrAllDatabaseData.toJSON());
    });
});


export const GetPeerIDForUDID = functions.https.onRequest((request, response) =>
{ 
    return corsHandler(request, response,() => 
    {
       console.log(request.body);

        //get the device udid
       const strUniqueDeviceID = String(request.body.m_strUdid);

       console.log(strUniqueDeviceID);
        
       //check for null empty or undifined request
       if(!strUniqueDeviceID)
       {
           response.status(400).json(
               {                  
                   message: 'Unique ID Not Included in request' + strUniqueDeviceID
               }
           );
       }

       const UdidMappingAddress = admin.database().ref('UdidToPeerID').child(strUniqueDeviceID);

       //chech to see if unique id has map to peer id
       UdidMappingAddress.once('value')
       .then((DataSnapshot) =>
       {
           console.log(DataSnapshot);

           //on unique id found
           if(DataSnapshot.val() !== null)
           {           
               return DataSnapshot.val();
           }
           else
           {
               const lNewUserID :number = UniformBitRandLong();
               const lNewUserAccessKey :number = UniformBitRandLong();

               //create new user 
               const adrNewUserAddress = admin.database().ref('Users').child(lNewUserID.toString());

               const prmPromiseArray = [];

               //push new user to the server 
               prmPromiseArray.push( SetupNewPeer(adrNewUserAddress,lNewUserAccessKey));
               prmPromiseArray.push( SetupNewUdidMapping(UdidMappingAddress,lNewUserID,lNewUserAccessKey));


               return Promise.all(prmPromiseArray).then(() =>
               {
                   const uivUserIDValues = {
                       m_lUserID: lNewUserID,
                       m_lUserKey: lNewUserAccessKey
                   };

                  return uivUserIDValues
               })
           }
       })
       .then((result) =>
       {
           response.status(200).json(result);
       })
       .catch((error) =>
       {
           console.log('Error:' + error);

           response.status(500).send(error);
       });

       //response.send("Failed to find peer id for udid");
    });

});

 //sends a message from one peer to another
 export const SendMessageToPeer = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        //check that request was fully formed 
        const lFromID:number = Number(request.body.m_lFromID) || 0;
        const lToID:number = Number(request.body.m_lToID) || 0;
        const iType:number = Number(request.body.m_iType);
        const strMessage:string = request.body.m_strMessage;
        
        let bIsValidRequest:boolean = true;

        // validate request types
        if(lFromID === 0)
        {
            bIsValidRequest = false;
        }
        if(lToID === 0)
        {
            bIsValidRequest = false;
        }

        if(Number.isNaN(iType))
        {
            bIsValidRequest = false;
        }

        if((typeof strMessage).localeCompare('string')!== 0 || !strMessage)
        {
            bIsValidRequest = false;
        }

        if(bIsValidRequest === false)
        {
            response.status(400).json(
                {                  
                    message: 'Bad Request data in request FromID:' + lFromID + ' ToID:' + lToID + ' Type:' + iType + ' Message:' + strMessage
                }
            );

            return;
        }

        //get target directory 
        const UserMessageAddress = admin.database().ref('Users').child(lToID.toString()).child('Messages').push();

        //create message
        const MessageCreatePromises = []

        MessageCreatePromises.push(UserMessageAddress.child('dtmDate').set(admin.database.ServerValue.TIMESTAMP));
        MessageCreatePromises.push(UserMessageAddress.child('lFrom').set(lFromID));
        MessageCreatePromises.push(UserMessageAddress.child('iType').set(iType));
        MessageCreatePromises.push(UserMessageAddress.child('strMessage').set(strMessage));

        Promise.all(MessageCreatePromises).then((res)=>
        {
            response.status(200).send('success');

        }).catch((error) =>
        {
            console.log('Error:' + error);

            response.status(500).json(
                {                  
                    message: 'Error in sending message' + error
                }
            );
        });
    });
});

//get the messages for a user 
export const GetMessagesForPeer = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        //get user id
        const lUserID:number = Number(request.body.m_lUserID) || 0;
        const lAccesKey: number = Number(request.body.m_lUserKey) || 0;

        if(lUserID === 0 || lAccesKey === 0)
        {
            response.status(400).json(
                {                  
                    message: 'Bad Request data in request UserID:' + lUserID + ' AccessKey:' + lAccesKey
                }
            );

            return;
        }

        //try get user messages
        const adrUserAccessKeyAddress = admin.database().ref('Users').child(lUserID.toString()).child('m_lUserKey');
        const adrUserMessageAddress = admin.database().ref('Users').child(lUserID.toString()).child('Messages');

        const MessageCreatePromises = []

         //message object
         interface MessageDetials
         {
            strKey: string,
            anyValue: any
         }

        const Messages = new Array<MessageDetials>();
        let bIsValidReqest = true;

        MessageCreatePromises.push(adrUserAccessKeyAddress.once('value').then((ReturnValues) =>
        {
            if(ReturnValues === null )
            {
                //check if peer existed at all
                response.status(404).json(
                    {                  
                        message: 'User Does Not Exist UserID:' + lUserID
                    }
                );

                bIsValidReqest = false;

                return;
            }
            else if (ReturnValues.val() !== lAccesKey)
            {
                 //check if peer existed at all
                 response.status(500).json(
                    {                  
                        message: 'Incorrect User Key  Access Key:' + ReturnValues.val() + ' Passed Key:' + lAccesKey + ' UserKey:' + lUserID 
                    }               
                );

                bIsValidReqest = false;

                return;
            }

            bIsValidReqest = true;

            return;
        }));

        //get messages 
        MessageCreatePromises.push(adrUserMessageAddress.once('value').then((ReturnValue) =>
        {      
            //check if there was any messages 
            if(ReturnValue === null)
            {
                console.log('No messages found at address ' + adrUserMessageAddress);

               return;
            }
            else
            {
                ReturnValue.forEach((messageSnapshot) =>
                {
                    const MessageDetails = 
                    {
                        strKey: String(messageSnapshot.key),
                        anyValue: messageSnapshot.val()
                    };

                    Messages.push(MessageDetails)
                }); 

                return;
            }        
        }));

        //wait for all promises to complete
        Promise.all(MessageCreatePromises).then(() =>
        {
            if(bIsValidReqest === false)
            {
                return null;
            }   

            interface ReplyMessage
            {
                m_lFromUser: number,
                m_dtmTimeOfMessage: number,
                m_iMessageType: number,
                m_strMessage: string
            }

            //build reply message
            const msgReplyMessage = new Array<ReplyMessage>();

            //the min time for a message to be valid
            const dtmMinValidMessageAge = Date.now() - (1000 * 20);

            const prmDeletePromisies = []

            for (let msgMessage of Messages) 
            {
                const dtmMessageCreationTime = Number(msgMessage.anyValue.dtmDate);
                if(dtmMessageCreationTime > dtmMinValidMessageAge)
                {
                    const msgUserMessage:ReplyMessage = {
                        m_lFromUser: msgMessage.anyValue.lFrom,
                        m_dtmTimeOfMessage: msgMessage.anyValue.dtmDate,
                        m_iMessageType: msgMessage.anyValue.iType,
                        m_strMessage: msgMessage.anyValue.strMessage
                    };

                    msgReplyMessage.push(msgUserMessage);
                }

                prmDeletePromisies.push(adrUserMessageAddress.child(msgMessage.strKey.toString()).remove())
            };

            //wait for messages to finish deleting 
            return Promise.all(prmDeletePromisies).then(()=>
            {
                //return the compiled reply message
                return msgReplyMessage;
            } );

        }).then((result) =>
        {
            if(result !== null)
            {
                //send reply message 
                response.status(200).json(
                {                  
                    m_usmUserMessages: result
                });
            }

        }).catch((error)=>
        {
            console.log('Error:' + error);

            //send reply message 
            response.status(500).json(
            {                  
                Error: error
            });
        });
    });
});

// what is the state of the conenction, how many spots free are there
class GatewayState
{
    m_iRemainingSlots: number = 0
}

// what is the state of the game
class GameState
{   
    // raw data for game state
    m_strGameState: string = ''
}

class GatewayDetails
{
    m_dtmLastActiveTime:number = 0 // the last time this gate was updated
    m_lUserID: number = 0// the id of the user managing this gate
    m_lUserKey: number = 0// private key used to update this gate, the gate should not be changed without this private key
    m_gwsGateState: GatewayState = new GatewayState() 
    m_lGameFlags: number = 0
    m_lGameID: number = 0
}

class GateReturnData
{
    m_lGateOwnerUserID: number = 0 // the id of the user managing this gate
    m_gwsGateState: GatewayState = new GatewayState()
    m_lGameFlags: number = 0 //details about the game state
    m_lGameState: GameState = new GameState() //game specific deets
}

//sets a gateway 
export const SetGateway = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        console.log('Set Gateway Start');

        //get owning player and owning player key
        const dtmOldestValidGateTime:number = Number(Date.now());
        const lUserID:number = Number(request.body.m_lUserID) || 0;
        const lUserKey:number = Number(request.body.m_lUserKey) || 0;
        const staGateState: GatewayState = request.body.m_gwsGateState;

        //java script converts numbers to 32 bit when doing binary actions on them so even through number is 64 they must be treated as 32
        const lGameType:number = (Number(request.body.m_lGameType) || Number(0)) << Number(32 - 8); // move the game number to the top 8 bits 
        const lFlags:number = ((Number(request.body.m_lFlags) || Number(0)) << Number(8)) >> Number(8);  // remove the top 8 bits from the flag value

        const gstGameState:GameState = request.body.m_gstGameState;

        console.log('request data fetched');

        const gdtGateDetails: GatewayDetails =
        {
            m_dtmLastActiveTime: dtmOldestValidGateTime,
            m_lUserID: lUserID,
            m_lUserKey: lUserKey,
            m_gwsGateState: staGateState,
            m_lGameFlags : lGameType | lFlags,
            m_lGameID: UniformBitRandLong()
        }

        //validate inputs 
        if(lUserID === 0 || lUserKey === 0 || staGateState === null || staGateState === undefined || staGateState.m_iRemainingSlots === undefined)
        {
            console.log('Bad Request data in request UserID:' + lUserID + ' AccessKey:' + lUserKey + ' Game State' + staGateState);

            response.status(400).json(
                {                  
                    message: 'Bad Request data in request UserID:' + lUserID + ' AccessKey:' + lUserKey + ' Game State' + staGateState
                }
            );

            return;
        }

        console.log('Not Bad Input');

        //check if already exists 
        const adrGatewayAccessKeyAddress = admin.database().ref('Gateways').child(lUserID.toString())

        //get gateway access key
        adrGatewayAccessKeyAddress.once('value').then((result) => 
        {
            console.log('Result from get gateway for user: ' + result.val());

            if(result.val() === null || result.val().m_lUserKey === lUserKey)
            {
                const GatewayAddress = admin.database().ref('Gateways').child(lUserID.toString());

                if(result.val() != null)
                {
                    console.log('updating game id key');
                    console.log('m_lGameID == ' + result.val().m_lGameID);
                    //get existing gateway id
                    gdtGateDetails.m_lGameID = result.val().m_lGameID;
                }
                //let GatewayConnectPromise = []

                //GatewayConnectPromise.push(GatewayAddress.child('LastActivity').set(admin.database.ServerValue.TIMESTAMP))
                //GatewayConnectPromise.push(GatewayAddress.child('AccessKey').set(strAccessKey))
                //GatewayConnectPromise.push(GatewayAddress.child('GameState').set(staGameState))
            
                //return Promise.all(GatewayConnectPromise).then(() => 
                //{
                //    return true;
                //});

                console.log('setting gateway to' + gdtGateDetails);

                return GatewayAddress.set(gdtGateDetails).then(()=>
                {
                    //check if there is a state that needs updating as well
                    if(gstGameState != undefined && gstGameState.m_strGameState != undefined)
                    {
                        const GameAddress = admin.database().ref('GameStates').child(lUserID.toString());

                        GameAddress.set(gstGameState);
                    }
                    
                    return true;
                })
            }
            else
            {
                console.log('peer passed in wrong key, gate update blocked' + result.val());
                return false;
            }
        }).then((returnValue) =>
        {
            if(returnValue === true)
            {
                response.status(200).json(
                    {                  
                        message: 'Success'
                    }
                );
            }
            else
            {
                console.log('Error Incorrect key passed: ' + lUserKey);

                response.status(400).json(
                    {                  
                        message: 'Incorrect Key, Passed key:' + lUserKey
                    }
                );
            }

        }).catch((error)=>
        {
            console.log('Error:' + error);

            //send reply message 
            response.status(500).json(
            {                  
                Error: error
            });
        });
    });
});

//gets a single gateway 
export const GetGateway = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        console.log('Get Gateway Start');

        //the requirements for the game 
        // const lGameType:bigint = BigInt(request.body.m_lGameType) << BigInt(128 - 8); // move the game number to the top 8 bits 
        // const lFlags:bigint = (BigInt(request.body.m_lFlags) << BigInt(8)) >> BigInt(8);  // remove the top 8 bits from the flag value

        //in the future get the peer details and find a game with 
        //matching world location / other deets 

        //get all gateways
        const adrGateways = admin.database().ref('Gateways');
        
        const gdtActiveGateways = new Array<GatewayDetails>()
        const strDeadGateways = new Array<string>()

         //java script converts numbers to 32 bit when doing binary actions on them so even through number is 64 they must be treated as 32
         const lGameType:number = (Number(request.body.m_lGameType) || Number(0)) << Number(32 - 8); // move the game number to the top 8 bits 
         const lFlags:number = ((Number(request.body.m_lFlags) || Number(0)) << Number(8)) >> Number(8);  // remove the top 8 bits from the flag value
         const lCombinedFlags:number = lFlags | lGameType;

        //get gateway details
        adrGateways.once('value').then((result) =>
        {        
            if(result.val() !== null)
            {
                //the oldest time for an active gateway 
                const dtmOldestValidGateTime:number = Date.now() - (1000 * 20);

                result.forEach((gateway) =>
                {
                    console.log('GetGatewayValue: last active time:' + gateway.val().m_dtmLastActiveTime + ' oldest Valid Time:' + dtmOldestValidGateTime)

                    if(Number(gateway.val().m_dtmLastActiveTime) < dtmOldestValidGateTime)
                    {
                        strDeadGateways.push(String(gateway.key));
                    }
                    else if(Number(gateway.val().m_gwsGateState.m_iRemainingSlots) > 0 && ((gateway.val().m_lGameFlags & lCombinedFlags) === lCombinedFlags))
                    {
                        gdtActiveGateways.push(gateway.val() as GatewayDetails)
                    }
                })
            }
        }).then(() =>
        {
            const prsRemoveGatePromises = []

            for(let strGateway of strDeadGateways)
            {
                prsRemoveGatePromises.push(adrGateways.child(strGateway).remove())
            }

            return Promise.all(prsRemoveGatePromises).then();
        }).then(() =>
        {
            console.log('Check if a gate was found');
            //if there are no gateways return a 404 and let the user create a new one
            if(gdtActiveGateways.length === 0)
            {

                response.status(404).json(
                    {                  
                        message:'No active Gateways exist'
                    }
                );

                return;
            };

            console.log('get active gate with least players');

            var gwdBestGateway: GatewayDetails = gdtActiveGateways[0];

            for(let i = 1 ; i < gdtActiveGateways.length; i++)
            {
                // get the gate with the most empty slots
                if(gwdBestGateway.m_gwsGateState.m_iRemainingSlots < gdtActiveGateways[i].m_gwsGateState.m_iRemainingSlots)
                {
                    gwdBestGateway = gdtActiveGateways[i];
                }

            }

            console.log('get game state for best player');

            var grdGate: GateReturnData = new GateReturnData();

            grdGate.m_lGateOwnerUserID = gwdBestGateway.m_lUserID; // the id of the user managing this gate
            grdGate.m_gwsGateState = gwdBestGateway.m_gwsGateState;
            grdGate.m_lGameFlags = gwdBestGateway.m_lGameFlags; //details about the game state
            //grdGate.m_lGameState: new GameState() //game specific deets

            const adrGateways = admin.database().ref('GameStates').child(gwdBestGateway.m_lGameID.toString());

            console.log('try get data from gateway');
            //get the gate details
            adrGateways.once('value').then((result) => 
            {
                console.log('Result from get game details :' + result.val());
    
                if(result.val() != null || result.val() != undefined)
                {
                    console.log('updating game state');
                    grdGate.m_lGameState = result.val();
                }
            })

            console.log('sending data :' + grdGate);
            response.status(200).json( 
            {
                m_grdGateReturnData: grdGate
            });

        }).catch((error) =>
        {
            console.log('Error:' + error)
            //send reply message 
            response.status(500).json(
            {                  
                Error: error
            });
        })
    });
});

//gets a single gateway 
export const GetGatewayList = functions.https.onRequest((request, response) =>
{
    return corsHandler(request, response,() => 
    {
        console.log('Get Gateway list Start');

        //the requirements for the game 
        // const lGameType:bigint = BigInt(request.body.m_lGameType) << BigInt(128 - 8); // move the game number to the top 8 bits 
        // const lFlags:bigint = (BigInt(request.body.m_lFlags) << BigInt(8)) >> BigInt(8);  // remove the top 8 bits from the flag value

        //in the future get the peer details and find a game with 
        //matching world location / other deets 

        //get all gateways
        const adrGateways = admin.database().ref('Gateways');
        
        const gdtActiveGateways = new Array<GatewayDetails>()
        const strDeadGateways = new Array<string>()

         //java script converts numbers to 32 bit when doing binary actions on them so even through number is 64 they must be treated as 32
         const lGameType:number = (Number(request.body.m_lGameType) || Number(0)) << Number(32 - 8); // move the game number to the top 8 bits 
         const lFlags:number = ((Number(request.body.m_lFlags) || Number(0)) << Number(8)) >> Number(8);  // remove the top 8 bits from the flag value
         const lCombinedFlags:number = lFlags | lGameType;

        //get gateway details
        adrGateways.once('value').then((result) =>
        {        
            if(result.val() !== null)
            {
                //the oldest time for an active gateway 
                const dtmOldestValidGateTime:number = Date.now() - (1000 * 20);

                result.forEach((gateway) =>
                {
                    console.log('GetGatewayValue: last active time:' + gateway.val().m_dtmLastActiveTime + ' oldest Valid Time:' + dtmOldestValidGateTime)

                    if(Number(gateway.val().m_dtmLastActiveTime) < dtmOldestValidGateTime)
                    {
                        strDeadGateways.push(String(gateway.key));
                    }
                    else if(Number(gateway.val().m_gwsGateState.m_iRemainingSlots) > 0 && ((gateway.val().m_lGameFlags & lCombinedFlags) === lCombinedFlags))
                    {
                        gdtActiveGateways.push(gateway.val() as GatewayDetails)
                    }
                })
            }
        }).then(() =>
        {
            const prsRemoveGatePromises = []

            for(let strGateway of strDeadGateways)
            {
                prsRemoveGatePromises.push(adrGateways.child(strGateway).remove())
            }

            return Promise.all(prsRemoveGatePromises).then();
        }).then(() =>
        {
            console.log('Check if a gate was found');
            //if there are no gateways return a 404 and let the user create a new one
            if(gdtActiveGateways.length === 0)
            {
                response.status(404).json(
                    {                  
                        message:'No active Gateways exist'
                    }
                );

                return;
            };

            console.log('get game state for gates');

            var grdGate: Array<GateReturnData> = new Array<GateReturnData>(gdtActiveGateways.length);
            
            for(var i = 0 ; i < gdtActiveGateways.length; i++)
            {
                console.log('setting up gate data for index :' + i);
                grdGate[i] = new GateReturnData();
                grdGate[i].m_lGateOwnerUserID = gdtActiveGateways[i].m_lUserID; // the id of the user managing this gate
                grdGate[i].m_gwsGateState = gdtActiveGateways[i].m_gwsGateState;
                grdGate[i].m_lGameFlags = gdtActiveGateways[i].m_lGameFlags; //details about the game state
                //grdGate.m_lGameState: new GameState() //game specific deets

                const adrGateways = admin.database().ref('GameStates').child(gdtActiveGateways[i].m_lGameID.toString());

                console.log('try get data from gateway');
                //get the gate details
                adrGateways.once('value').then((result) => 
                {
                    console.log('Result from get game details :' + result.val());
    
                    if(result.val() != null || result.val() != undefined)
                    {
                        console.log('updating game state');
                        grdGate[i].m_lGameState = result.val();
                    }
                })
            }

            console.log('sending data :' + grdGate);
            
            response.status(200).json( 
            {
                m_arrGateReturnData: grdGate
            });

        }).catch((error) =>
        {
            console.log('Error:' + error)
            //send reply message 
            response.status(500).json(
            {                  
                Error: error
            });
        })
    });
});