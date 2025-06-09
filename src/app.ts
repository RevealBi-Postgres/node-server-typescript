import express, { Application } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import reveal,
{
	IRVUserContext,
	RevealOptions,
	RVDashboardDataSource,
	RVDataSourceItem,
	RVPostgresDataSource,
	RVPostgresDataSourceItem,
	RVUserContext,
	RVUsernamePasswordDataSourceCredential
} from 'reveal-sdk-node';
import cors from "cors";
import { IncomingMessage } from 'http';

const app: Application = express();

app.use(cors());

// Step 0: OPTIONAL Fetch dashboards from the dashboards folder
app.get('/dashboards', (req, res) => {
	const directoryPath = './dashboards';
  
	fs.readdir(directoryPath, (err, files) => {
	  if (err) {
		res.status(500).send({ error: 'Unable to scan directory' });
		return;
	  }
  
	  const fileNames = files.map((file) => {
		const { name } = path.parse(file);
		return { name };
	  });
  
	  res.send(fileNames);
	});
  });

// Step 1: OPTIONAL Create a user context provider
const userContextProvider = (request: IncomingMessage): RVUserContext => {
	let userId = request.headers['x-header-one'] as string | undefined;
	const orderId = request.headers['x-header-orderid'] as string | undefined;
	const employeeId = request.headers['x-header-employeeid'] as string | undefined;
  
	if (!userId) {
		userId = "ALFKI"; // Default user ID
	  }
  
	// Determine the role based on the userId
	let role = "User";
	if (userId === "AROUT" || userId === "BLONP") {
	  role = "Admin";
	}
  
	// Create the properties map
	const props = new Map<string, any>();
	props.set("OrderId", orderId);
	props.set("EmployeeId", employeeId);
	props.set("Role", role);
  
	console.log(`UserContextProvider: ${userId} ${orderId} ${employeeId}`);
  
	return new RVUserContext(userId, props);
  };

// Step 2: REQUIRED Create an authentication provider with username / password to your Postgres database
const authenticationProvider = async (userContext: IRVUserContext | null, dataSource: RVDashboardDataSource) => {
	if (dataSource instanceof RVPostgresDataSource) {
		return new RVUsernamePasswordDataSourceCredential("jason", "jason");
	}
	return null;
}

// Step 3: REQUIRED Create a data source item provider to handle curated data source items, custom queries, functions, etc.
const dataSourceItemProvider = async (userContext: IRVUserContext | null, dataSourceItem: RVDataSourceItem) => {
	if (dataSourceItem instanceof RVPostgresDataSourceItem) {		
		
		//REQUIRED - update underlying data source - even if you don't have any custom queries, you MUST call this function
		dataSourceProvider(userContext, dataSourceItem.dataSource);
		// Update table based on dataSourceItemId request from the client
		// everything in these 'if' statements is optional
		if (dataSourceItem.id == "CustomerOrders") {
			dataSourceItem.customQuery = "SELECT * FROM \"OrdersQry\"";
		}		

		if (dataSourceItem.id === "CustOrderHist") {
			dataSourceItem.customQuery = `SELECT customers.*, orders.orderid, orders.orderdate, orders.shipname, 
					orders.shipaddress, orders.shipcity, orders.shipregion, 
					orders.shippostalcode, orders.shipcountry 
					FROM customers 
					JOIN orders ON customers.customerId = orders.customerid 
					WHERE customers.customerId = '${userContext?.userId}'`;
		  }

		if (dataSourceItem.id === "CustOrdersDates") {
			dataSourceItem.functionName= "customerordersf";
			dataSourceItem.functionParameters = {
				custid: userContext?.userId
			};
		}

		// Note that Tables, Views & MaterializedViews are referenced as .table
		if (dataSourceItem.id === "Invoices") {
			dataSourceItem.table = "OrdersQry";
		}	
	}
	console.log(`DataSourceItemProvider: ${dataSourceItem}`);
	return dataSourceItem;
}

// Step 4: REQUIRED Add Host, Database to connect.  Schema is optional.
const dataSourceProvider = async (userContext: IRVUserContext | null, dataSource: RVDashboardDataSource) => {
	if (dataSource instanceof RVPostgresDataSource) {
		dataSource.host = "s0106docker2.infragistics.local";
		dataSource.database = "Northwind";
		// optional - set your schema
		//dataSource.schema = "public";
	}
	return dataSource;
}

// Step 5: OPTIONAL Create a data source item filter to restrict access to certain data source items
const dataSourceItemFilter = async (userContext: IRVUserContext | null, dataSourceItem: RVDataSourceItem): Promise<boolean> => {
	if (dataSourceItem instanceof RVPostgresDataSourceItem) {
	  // Create an Include or Exclude list
	  const includedList = ["customers", "orders", "orderdetails"];
  
	  // Check user role from the userContext
	  const role = userContext?.properties.get("Role") || "User";
  
	  if (role === "User") {
		// Allow only items in the included list for "User" role
		if (dataSourceItem.table && includedList.includes(dataSourceItem.table)) {
		  return true; // Allow access
		}
	  } else {
		// Allow everything for non-"User" roles
		return true;
	  }
	}
	return false; // Deny access
  };

// Step 6: Set up the RevealOptions
const revealOptions: RevealOptions = {
	userContextProvider: userContextProvider,
	authenticationProvider: authenticationProvider,
	dataSourceProvider: dataSourceProvider,
	dataSourceItemProvider: dataSourceItemProvider,
	dataSourceItemFilter: dataSourceItemFilter,
}
app.use('/', reveal(revealOptions));

// Start the server
app.listen(5111, () => {
	console.log(`Reveal server accepting http requests`);
});