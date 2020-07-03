/*==========================
 * Admin
 *
 * @description: Have a simpler way of dealing with manipulations in the database
 * @author: Government of Canada; @duboisp; @GormFrank
 * @version: 1.0
 *
 * addTopic
 * updateTopic
 * deleteTopic
 * confirmSubs
 * validateTemplateConfig
 * Send a test email confirmation email to the specified email address
 ===========================*/

 // yep
 
const mustache = require('mustache');
const fsPromises = require('fs').promises;
const dbConn = module.parent.exports.dbConn;
const ObjectId = require('mongodb').ObjectId;

const { Worker } = require('worker_threads');

const _mailingState = {
	cancelled: "cancelled",
	draft: "draft",
	completed: "completed",
	approved: "approved",
	sending: "sending",
	sent: "sent"

};



/* ++++++++++++++++++++++++++++++++++++++++++++++++++++
 * ++++++++++++++++++++++++++++++++++++++++++++++++++++
 *
 * Form post action end points, management of the temporary views
 *
 * @return an HTML page
 *
 */
 
async function renderTemplate( tmplName, data ) {
	// Get the view, mustache template
	// Render and return the result.
	
	let createTemplate = await fsPromises.readFile( 'views/' + tmplName, 'UTF-8' );
	return mustache.render( createTemplate, data );
}


/*
 * Management of Mailing
 */
exports.v_mailingManage = async ( req, res, next ) => {

	const userId = req.body.userId;
	
	if ( !req.user.accessToTopicId ) {
		res.status( 401 );
		res.end();
		return
	}
	
	// Get the topic ID group the
	let topics = req.user.accessToTopicId;
	
	// Show a interface to create mailing + Choice of topicID
	let mailings = await mailingListing( topics );

	const mustacheData = Object.assign( {}, { topics: topics }, { mailings: mailings } );
	
	//console.log( mustacheData );

	// Show a list of mailingID
	
	res.status( 200 ).send( await renderTemplate( "mailingManage.html",  mustacheData ) );
}

/*
 * Mailing login
 */
exports.v_mailingLogin = async ( req, res, next ) => {
	res.status( 200 ).send( await fsPromises.readFile( 'views/' + 'mailingLogin.html', 'UTF-8' ) );
}

exports.v_mailingEdit = async ( req, res, next ) => {
	// Input: MailingID
	

	try {
		const mailingid = req.params.mailingid;
	
		// Get the mailing
		let mailing = await mailingView( mailingid ),
			mailingState = mailing.state;
		
		let btnControler = {
			showApproved: 1
		}
		// Adjust the workflow based on the state
		// Nothing to do for: mailingState.draft; mailingState.cancelled; mailingState.sent

		
		if ( mailingState === _mailingState.completed ) {

			btnControler = {
				showApproved: 1
			}
		
		} else if ( mailingState === _mailingState.approved ) {
		
			btnControler = {
				showSendToSubs: 1
			}
			
		} else if ( mailingState === _mailingState.sending ) {
		
			btnControler = { 
				showCancelSend: 1
			}
		
		}
		
		
		// Parse the body
		jsBody = { jsBody: mailing.body.replace( /\r/g, "").replace( /\n/g, "\\n" ) };
		
		// Render the page
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", Object.assign( {}, mailing, btnControler, jsBody ) ) );
		
	} catch ( e ){
		
		// Return mailingManager + Error message
		console.log( "v_mailingEdit err:" );
		console.log( e );
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", e ) );
	}
	
}


/* 
 * Mailing Edit actions
 */
// Create an empty mailing and show "mailingView"
exports.v_mailingCreate = async ( req, res, next ) => {
	
	try {
		const { topic, title } = req.body;
	
		// Create the mailing
		let mailingId = await mailingCreate( topic, title );
		
		// Let's the edit mailing do the work
		res.redirect( "/api/v1/mailing/" + mailingId + "/edit" )
	} catch ( e ){
		
		// Return mailingManager + Error message
		console.log( "v_mailingCreate err:" );
		console.log( e );
		res.status( 200 ).send( await renderTemplate( "mailingManage.html", e ) );
	}
	
	next();
}

exports.v_mailingHistory = async ( req, res, next ) => {

 
	const mailingId = req.params.mailingid;
		
		// Save the mailing
		let history = await mailingGetHistory( mailingId );
		
		// Render the page
		res.status( 200 ).send( await renderTemplate( "mailingHistory.html", { history : history } ) );
		

}

exports.v_mailingSave = async ( req, res, next ) => {
	// Save the draft email
	// Set state to "draft"
	
	if ( !req.user.email ) {
		res.status( 401 );
		res.end();
		return
	}
	
	try {
		const mailingid = req.params.mailingid,
			isSaveAndTest = req.body.action;
		
		// console.log( req.body );
		
		// Save the mailing
		let mailing = {};

		let msg = "Saved"; // status message
		
		if ( isSaveAndTest === "saveTest" ) {
			mailing = await mailingSaveTest( req.user.email, mailingid, req.body.title, req.body.subject, req.body.body, req.body.comments );
			msg += " and test sent";
		} else {
			mailing = await mailingSave( mailingid, req.body.title, req.body.subject, req.body.body, req.body.comments );
		}
		
		mailing.msg = msg; // status message		
		
		// Parse the body
		jsBody = { jsBody: mailing.body.replace( /\r/g, "").replace( /\n/g, "\\n" ) };
		
		// Render the page
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", Object.assign( {}, mailing, jsBody ) ) );
		
		
	} catch ( e ){
		
		// Return mailingManager + Error message
		console.log( "v_mailingSave err:" );
		console.log( e );
		res.status( 200 ).send( await renderTemplate( "mailingEdit.html", e ) );
	}
}

exports.v_mailingCancelled = async ( req, res, next ) => {
	// Set state to "cancelled"
}


exports.v_mailingApproval = async ( req, res, next ) => {
	// Send a test email to the predefined list of emails
	// Set state to "completed"
	
	const mailingId = req.params.mailingid;
	
	await mailingApproval( mailingId );
	
	res.redirect( "/api/v1/mailing/" + mailingId + "/edit" );
	
}

exports.v_mailingApproved = async ( req, res, next ) => {
	// Need to be in current state "completed"
	// Set state to "approved"
	
	const mailingId = req.params.mailingid;
	
	await mailingApproved( mailingId );
	
	res.redirect( "/api/v1/mailing/" + mailingId + "/edit" );
}

exports.v_mailingSendToSub = async ( req, res, next ) => {
	// Need to be in current state "approved"
	// Change state tot "sending"
	// Do the sending
	// When completed, change state to "sent"
	
	const mailingId = req.params.mailingid;
	
	await mailingSendToSub( mailingId );
	
	res.redirect( "/api/v1/mailing/" + mailingId + "/edit" );
	
}


exports.v_mailingCancelSendingToSub = async ( req, res, next ) => {
	// Need to abort the sending job.
}


/* +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 * +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 *
 * future Public API end point
 *
 * @return an JSON
 *
 */
/*
 * Get list of Mailing for the given topics
 */
async function mailingListing ( topics ) {
	// Produce a list of mailingID
	
	// Ensure that topics is an array
	topics = Array.isArray( topics ) ? topics : [ topics ];
	
	const rDoc = await dbConn.collection( "mailing" ).find( 
		{
			topicId: { $in: topics }
		},
		{
			projection: {
				title: 1,
				topicId: 1,
				createdAt: 1,
				updatedAt: 1,
				state: 1
			},
			sort: {
				createdAt: -1,
				updatedAt: -1
			}
		});
	
	return rDoc.toArray();
}

async function mailingCreate ( paramTopicId, paramTitle ) {
	// Create an empty mailing and show "mailingView"
	
	// Input: TopicID, Name
	const topicId = paramTopicId,
		mailingTitle = paramTitle + "" || "",
		currDate = new Date();
	
	// Validate topicId
	const topic = getTopic( topicId );

	if ( !topic ) {
		console.log( "mailingCreate: no topic: " + topicId );
		throw Error( "Can't create a topic" );
	}
	
	// Validate mailingName
	if ( !mailingTitle.length ) {
		console.log( "mailingCreate: Empty name: " + mailingTitle );
		throw Error( "Can't create a topic" );
	}
	
	// Create the mailing
	let rInsert = await dbConn.collection( "mailing" ).insertOne( 
		{
			topicId: topicId,
			title: mailingTitle,
			createdAt: currDate,
			state: _mailingState.draft
		});
	
	// Return: New MailingID
	return rInsert.insertedId;
	
}

async function mailingView ( paramMailingId ) {
	// Input: MailingID
	
	const rDoc = await dbConn.collection( "mailing" ).findOne( { _id: ObjectId( paramMailingId ) } );
	
	if ( !rDoc ) {
		console.log( "mailingView: Invalid mailing id: " + paramMailingId );
		throw new Error( "Mailing unavailable" );
	}
	
	return {
		id: rDoc._id,
		topicId: rDoc.topicId,
		title: rDoc.title,
		state: rDoc.state,
		createdAt: rDoc.createdAt,
		updatedAt: rDoc.updatedAt || rDoc.createdAt,
		subject: rDoc.subject || "Mailing",
		body: rDoc.body || "Type your content here",
		history: rDoc.history || []
	}
}

async function mailingGetHistory ( mailingId ) {
	// Get all history for the given mailingId

	const rDoc = await dbConn.collection( "mailingHistory" ).find( 
		{
			mailingId: ObjectId( mailingId )
		},
		{
			sort: {
				createdAt: -1
			}
		});
	
	return rDoc.toArray();
}

/* ========================
 *
 * Mailing Edit actions
 *
 * ========================
 */
async function mailingCancelled( param ) {
	// Set state to "cancelled"
}

async function mailingSave ( mailingId, title, subject, body, comments ) {
	// Save the draft email
	// Set state to "draft"
	
	const rDoc = await mailingUpdate( mailingId, _mailingState.draft, {
			comments: comments,
			$set: {
				title: title,
				subject: subject,
				body: body,
			}
		} );
	
	return mailingView( mailingId );
}

async function mailingSaveTest ( email, mailingId, title, subject, body, comments ) {
	// Send a test email to the current logged user email
	// Set state to "draft"
	
	const rSave = await mailingSave( mailingId, title, subject, body, comments );
		
	// TODO: Change for current user email
	sendMailing( 
		[
			{
				email: email,
				subscode: "mailingSaveAndTest"
			}
		], mailingId, rSave.topicId, subject, body );

	return rSave;
}

async function mailingApproval ( mailingId ) {
	// Send a test email to the predefined list of emails
	// Set state to "completed"
	
	const rDoc = await mailingUpdate( mailingId, _mailingState.completed );

	
	// Send the mailing to the "approval email list"
	mailingSendToApproval( rDoc );
}

async function mailingApproved ( mailingId ) {
	// Need to be in current state "completed"
	// Set state to "approved"
	
	// await mailingUpdate( mailingId, _mailingState.approved, { historyState: _mailingState.completed } ); // To enfore it's current state is completed.
	await mailingUpdate( mailingId, _mailingState.approved );

	return true;
	
}

// Send mailing to approval email list
async function mailingSendToApproval( mailingInfo ) {

	// mailingInfo == mailing row
	
	let tDetails = await dbConn.collection( "topic_details" ).findOne( 
		{
			_id: mailingInfo.topicId
		},
		{
			projection: {
				approvers: 1
			}
		}
	);
	
	if ( !tDetails || !tDetails.approvers ) {
		console.log( "mailingSendToApproval-No approvals email for : " + mailingInfo.topicId );
		throw new Error( "No approvals email for : " + mailingInfo.topicId );
	}
	
	sendMailing ( tDetails.approvers, mailingInfo._id, mailingInfo.topicId, mailingInfo.subject, mailingInfo.body );

}

async function mailingSendToSub ( mailingId ) {
	// Need to be in current state "approved"

	const rDoc = await mailingUpdate( mailingId, _mailingState.sending, { historyState: _mailingState.approved } );
	

	// Check if the operation was successful, if not we know the error is already logged
	if ( !rDoc ) {
		return true;
	}
	
	// Do the sending
	sendMailingToSubs( mailingId, rDoc.topicId, rDoc.subject, rDoc.body );
	
	
	// When completed, change state to "sent"
	
}

// Update an history item for the mailing
async function mailingUpdate( mailingId, newHistoryState, options ) {

	// If option is undefined
	options = options || {};
	
	const historyState = options.historyState || false,
		comments = options.comments || false
		$set = options.$set || {};

	const currDate = new Date();
	
	// Create the history item
	let history = 
		{
			state: newHistoryState,
			createdAt: currDate
		}
	if ( comments ) {
		history.comments = comments;
	}
	
	// Create the historyEntry
	let rInsert = await dbConn.collection( "mailingHistory" ).insertOne( 
		Object.assign( {},
			history,
			{
				mailingId: ObjectId( mailingId )
			}
		)
	);
	history.historyId = rInsert.insertedId;
	
	// Update the mailing
	let findQuery = {
		_id: ObjectId( mailingId )
	};
	if ( historyState ) {
		findQuery.state = historyState
	}
	const rDoc = await dbConn.collection( "mailing" ).findOneAndUpdate( 
		findQuery,
		{
			$set: Object.assign( {}, $set, {
					state: newHistoryState
				}
			),
			$push: {
				history: {
					$each: [ history ],
					$slice: -7,
				}
			},
			$currentDate: { 
				updatedAt: true
			}
			
		}
	);
	
	// Check if the operation was successful, if not, we need to log in the history
	if ( !rDoc.ok ) {
	
		let historyFail = {
			createdAt: currDate,
			state: historyState || _mailingState.draft, // Put it back as draft if previous state is unknown
			comments: newHistoryState + " fail",
			mailingId: ObjectId( mailingId )
		};
		
		const rInsertFail = dbConn.collection( "mailingHistory" ).insertOne( 
			historyFail
		);
		historyFail.historyId = rInsertFail.insertedId;
		
		dbConn.collection( "mailing" ).findOneAndUpdate( 
			{
				_id: ObjectId( mailingId ),
				state: newHistoryState
			},
			{
				$set: {
					state: historyState || _mailingState.draft // Put it back as draft if previous state is unknown
				},
				$push: {
					history: {
						$each: [ historyFail ],
						$slice: -7,
					}
				}
				
			}
		);
	}
	
	// Send the mailing to the "approval email list"
	return rDoc.value;
}


// Simple worker to send mailing
async function sendMailingToSubs ( mailingId, topicId, mailingSubject, mailingBody ) {
	
	// When completed, change state to "sent"

	// Start the worker.
	const worker = new Worker( './controllers/workerSendEmail.js', {
		workerData: {
			topicId: topicId,
			mailingBody: mailingBody,
			mailingSubject: mailingSubject,
			typeMailing: "msgUpdates",
			sentTo: "allSubs",
			dbConn: true //dbConn
		}
	});
	
	worker.on('message', function(msg){
		
		if ( msg.completed ) {
			
			mailingUpdate( mailingId, _mailingState.sent, { historyState: _mailingState.sending } );
			
			// Change the status of the mailing and mark it completed
			console.log( "Send to subs - Completed: " + mailingId );
		}
		
		console.log( msg.msg );
	});
	
    worker.on('error', function(msg){
		console.log( "Send to subs - Worker ERRROR: " + msg );
	});
	
}

// Simple worker to send mailing
async function sendMailing ( sendToEmails, mailingId, topicId, mailingSubject, mailingBody ) {
	
	// Ensure that we have an array of emails
	if ( !Array.isArray( sendToEmails ) ) {
		console.log( "Need a valid emails list" );
		throw new Error ( "Need a valid emails list" );
	}

	// Start the worker.
	const worker = new Worker( './controllers/workerSendEmail.js', {
		workerData: {
			topicId: topicId,
			mailingBody: mailingBody,
			mailingSubject: mailingSubject,
			typeMailing: "msgUpdates",
			sentTo: sendToEmails,
			dbConn: true //dbConn
		}
	});
	
	worker.on('message', function(msg){
		
		if ( msg.completed ) {
			// Change the status of the mailing and mark it completed
			console.log( "sendMailing - Completed: " + mailingId );
		}
		
		console.log( msg.msg );
	});
	
    worker.on('error', function(msg){
		console.log( "sendMailing - Worker ERRROR: " + msg );
	});
	
}



/*
 *
 * Helper taken from subscription
 */
// Get the topic
let topicCached = [],
	topicCachedIndexes = [];
const _topicCacheLimit = process.env.topicCacheLimit || 50;

getTopic = ( topicId ) => {

	let topic = topicCached[ topicId ];
	
	if ( !topic ) {
		
		topic = dbConn.collection( "topics" ).findOne( 
			{ _id: topicId },
			{ projection: {
					_id: 1,
					templateId: 1,
					mailingNTmplId: 1,
					notifyKey: 1,
					confirmURL: 1,
					unsubURL: 1,
					thankURL: 1,
					failURL: 1,
					inputErrURL: 1
				} 
			} ).catch( (e) => {
				console.log( "getTopic" );
				console.log( e );
				return false;
			});

		topicCached[ topicId ] = topic;
		topicCachedIndexes.push( topicId );
		
		// Limit the cache to the last x topics
		if ( topicCachedIndexes.length > _topicCacheLimit ) {
			delete topicCached[ topicCachedIndexes.shift() ];
		}
	
	}
	
	return topic;
		
}




/*

Mailing data structure

Mailing
* Title - Name, text, internal name for this mailing
* Body - Markdown, body of the mail
* topicId - topic related to this mailing, we will re-use the same Notify API key
* state: Enum( cancelled, draft, completed, approved, sending, sent ) - For workflow management
* history (capped to last 10 actions)
	- https://docs.mongodb.com/manual/tutorial/model-embedded-one-to-many-relationships-between-documents/
	{
		historyId: ref to mailing_history corresponding record
		state: The last enum value
		createdAt
		comments (when state is sent, comment will include th email "body" value
	}
* createdAt
* updatedAt

- Mailing index:
	* topicId


topic:
	* mailingNotifyEmailTemplate (TemplateID to use when creating mailing)

topic_details
	* Add an array of emails, which we use to send test

Mailing_history
* Contains all action
* mailing_id
* state
* createdAt
* comments (when state is sent, comment will include th email "body" value

users
* name
* pass
* accessToTopicID [] array of topicId the person can access. // Temporary



-- x-notify: Remove teh download CSV button.

*/

/*




	<!--
		For now, use the JSON-Manager to fill the table.

		state:
			* List		-> User name is displayed

		action:
			* Initiate
			* Refresh
			* Create

		subTemplate
			* List of mailing
	-->
	<xny-list>
		<form>
			<p>Create a new mailing</p>
			<label>Title: <input /></label>
			<button>Create</button>
		</form>
		<table class="table">
			<caption>All mailing</caption>
			<thead>
				<th>Created</th>
				<th>Sent</th>
				<th>Mailing name</th>
				<th>Action</th>
			</thead>
			<tbody data-wb5-for="array">
				<template>
					<tr>
						<td>{{ Created }}</th>
						<td>{{ Sent }}</th>
						<th>{{ Title}}</th>
						<td>
							<button>Modify</button>
							<button>Delete</button>
						</td>
					</tr>
				</template>
			</tbody>
		</table>
	</xny-list>


	<!--
		state:
			* Edit		-> User name is displayed

		action:
			* Initiate
			* Refresh
			* Create

		subTemplate
			* List of mailing
	-->
	<xny-mailing>
		<h2>Mailing</h2>
		<p>Mailing title</p>

		<h3>Email</h3>
		<form data-action="http://localhost:8080/test/login">
			<div class="form-horizontal">
				<div class="form-group">
					<label for="login-username" class="col-sm-4 control-label">Title</label>
					<div class="col-sm-8">
						<input type="text" class="form-control" id="login-username" name="title" data-wb5-attr-value="dc:title" />
					</div>
				</div>
			</div>
			<div class="form-group">
				<label for="txtEmail">Markdown Content</label>
				<textarea class="form-control" id="txtEmail" name="txtEmail" rows="20" cols="200"></textarea>
			</div>

			<button data-wb5-on="save" type="button" class="btn btn-primary">Save</button>
			<button data-wb5-on="saveAndTest" type="button" class="btn btn-default">Save and test</button>
		</form>


		<h3>Workflow</h3>
		<ul>
			<li><button>Send for approval</button></li>
			<li><button data-wb5-attr-disable="isApproved">Send the mailing to all subscribers</button></li>
		</ul>



		<h3>History</h3>
		<ul>
			<template>
				<li>{{ date }} - {{ action }}</li>
			</template>
		</ul>

	</xny-mailing>




<!-- Create a mailing -->
<h1>Create a new mailing</h1>
<form method="post" action="/mailing/create">
	<div class="form-group">
		<label>Title: <input class="form-control" name="title" type="text" /></label>
	<button type="submit">Create</button>
</form>


<!-- List of mailing -->
<h1>List of mailing</h1>
<table class="table">
	<thead>
		<th>Created</th>
		<th>Sent</th>
		<th>Mailing name</th>
		<th>Action</th>
	</thead>
	<tbody>

		<template>
			<tr>
				<td>{{ Created }}</th>
				<td>{{ Sent }}</th>
				<th>{{ Title}}</th>
				<td>
					<a href="/mailing/edit/{mailingId}">Modify</a>
					<!--<a href="">Delete</a>-->
				</td>
			</tr>
		</template>

	</tbody>
</table>


<!-- Modify a mailing -->
<h1>Mailing</h1>
<p>{{ Mailing title }}</p>

<form data-action="/mailing/save/{mailingId}">
	<div class="form-horizontal">
		<div class="form-group">
			<label for="login-username" class="col-sm-4 control-label">Title</label>
			<div class="col-sm-8">
				<input type="text" class="form-control" id="login-username" name="title" data-wb5-attr-value="dc:title" />
			</div>
		</div>
	</div>
	<div class="form-group">
		<label for="txtEmail">Markdown Content</label>
		<textarea class="form-control" id="txtEmail" name="txtEmail" rows="20" cols="200"></textarea>
	</div>

	<button data-wb5-on="save" type="button" class="btn btn-primary">Save</button>
	<button data-wb5-on="saveAndTest" type="button" class="btn btn-default">Save and test</button>
</form>


<h3>Workflow</h3>
<ul>
	<li><button>Send for approval</button></li>
	<li><button data-wb5-attr-disable="isApproved">Send the mailing to all subscribers</button></li>
</ul>



<h3>History</h3>
<ul>
	<template>
		<li>{{ date }} - {{ action }}</li>
	</template>
</ul>

*/
