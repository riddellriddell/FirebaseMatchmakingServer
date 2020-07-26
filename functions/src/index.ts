import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
//import * as cryptogrpahy from 'crypto'

admin.initializeApp();

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

 export const GetPeerIDForUDID = functions.https.onRequest((request, response) =>
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

 //sends a message from one peer to another
export const SendMessageToPeer = functions.https.onRequest((request, response) =>
{
    //check that request was fully formed 
    const lFromID:number = Number(request.body.m_lFromID) || 0;
    const lToID:number = Number(request.body.m_lToID) || 0;
    const iType:number = Number(request.body.m_iType);
    const strMessage:string = request.body.m_strMessage;
    
    let bIsValidRequest:boolean = true;

    // validate request types
    if(lFromID == 0)
    {
        bIsValidRequest = false;
    }
    if(lToID == 0)
    {
        bIsValidRequest = false;
    }
    
    if(iType == NaN)
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

//get the messages for a user 
export const GetMessagesForPeer = functions.https.onRequest((request, response) =>
{
    //get user id
    const lUserID:number = Number(request.body.m_lUserID) || 0;
    const lAccesKey: number = Number(request.body.m_lUserKey) || 0;

    if(lUserID == 0 || lAccesKey == 0)
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

        for (let i = 0; i < Messages.length; i++) 
        {
            const dtmMessageCreationTime = Number(Messages[i].anyValue.dtmDate);
            if(dtmMessageCreationTime > dtmMinValidMessageAge)
            {
                let msgUserMessage:ReplyMessage = {
                    m_lFromUser: Messages[i].anyValue.lFrom,
                    m_dtmTimeOfMessage: Messages[i].anyValue.dtmDate,
                    m_iMessageType: Messages[i].anyValue.iType,
                    m_strMessage: Messages[i].anyValue.strMessage
                };

                msgReplyMessage.push(msgUserMessage);
            }

            prmDeletePromisies.push(adrUserMessageAddress.child(Messages[i].strKey.toString()).remove())
        };

        //wait for messages to finish deleting 
        return Promise.all(prmDeletePromisies).then(()=>
        {
            //return the compiled reply message
            return msgReplyMessage;
        } );

    }).then((result) =>
    {
        if(result != null)
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

  
interface GatewayState
{
    m_iRemainingSlots: number  
}

interface GatewayDetails
{
    m_dtmLastActiveTime:number
    m_lUserID: number
    m_lUserKey: number
    m_staGameState: GatewayState 
}


//sets a gateway 
export const SetGateway = functions.https.onRequest((request, response) =>
{
    console.log('Set Gateway Start');

    //get owning player and owning player key
    const dtmOldestValidGateTime:number = Number(Date.now());
    const lUserID:number = Number(request.body.m_lUserID) || 0;
    const lUserKey:number = Number(request.body.m_lUserKey) || 0;
    const staGameState: GatewayState = request.body.m_staGameState;

    const gdtGateDetails: GatewayDetails =
    {
        m_dtmLastActiveTime: dtmOldestValidGateTime,
        m_lUserID: lUserID,
        m_lUserKey: lUserKey,
        m_staGameState: staGameState
    }

    //validate inputs 
    if(lUserID == 0 || lUserKey == 0 || staGameState === null || staGameState === undefined || staGameState.m_iRemainingSlots === undefined)
    {
        console.log('Bad Request data in request UserID:' + lUserID + ' AccessKey:' + lUserKey + ' Game State' + staGameState);

        response.status(400).json(
            {                  
                message: 'Bad Request data in request UserID:' + lUserID + ' AccessKey:' + lUserKey + ' Game State' + staGameState
            }
        );

        return;
    }

    console.log('Not Bad Input');

    //check if already exists 
    const adrGatewayAccessKeyAddress = admin.database().ref('Gateways').child(lUserID.toString()).child('m_lUserKey');
    
    //get gateway access key
    adrGatewayAccessKeyAddress.once('value').then((result) => 
    {
        console.log('Result from get gateway for user' + result.val());

        if(result.val() === null || result.val() === lUserKey)
        {
            const GatewayAddress = admin.database().ref('Gateways').child(lUserID.toString());

            //let GatewayConnectPromise = []

            //GatewayConnectPromise.push(GatewayAddress.child('LastActivity').set(admin.database.ServerValue.TIMESTAMP))
            //GatewayConnectPromise.push(GatewayAddress.child('AccessKey').set(strAccessKey))
            //GatewayConnectPromise.push(GatewayAddress.child('GameState').set(staGameState))
 
            //return Promise.all(GatewayConnectPromise).then(() => 
            //{
            //    return true;
            //});

            return GatewayAddress.set(gdtGateDetails).then(()=>
            {
                return true;
            })
        }
        else
        {
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

//sets a gateway 
export const GetGateway = functions.https.onRequest((request, response) =>
{
    //in the future get the peer details and find a game with 
    //matching world location / other deets 

    //get all gateways
    const adrGateways = admin.database().ref('Gateways');
  
    const gdtActiveGateways = new Array<GatewayDetails>()
    const strDeadGateways = new Array<string>()
    
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
                else if(Number(gateway.val().m_staGameState.m_iRemainingSlots) > 0)
                {
                    gdtActiveGateways.push(gateway.val() as GatewayDetails)
                }
            })
        }
    }).then(() =>
    {
        const prsRemoveGatePromises = []

        for(let i = 0 ; i < strDeadGateways.length; i++)
        {
            prsRemoveGatePromises.push(adrGateways.child(strDeadGateways[i]).remove())
        }

        return Promise.all(prsRemoveGatePromises).then();
    }).then(() =>
    {
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

        let BestGateway = gdtActiveGateways[0]

        for(let i = 1 ; i < gdtActiveGateways.length; i++)
        {
            if(BestGateway.m_staGameState.m_iRemainingSlots < gdtActiveGateways[i].m_staGameState.m_iRemainingSlots)
            {
                BestGateway = gdtActiveGateways[i];
            }

        }

        response.status(200).json(
            {                  
                m_lGateOwnerUserID: BestGateway.m_lUserID
            }
        );
               
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