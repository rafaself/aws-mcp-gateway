export function buildDescribeDbInstancesParams(
  dbInstanceIdentifier: string,
): Record<string, string> {
  return {
    "DBInstanceIdentifier.1": dbInstanceIdentifier,
  };
}

export function buildDescribeDbSubnetGroupsParams(
  dbSubnetGroupName: string,
): Record<string, string> {
  return {
    "DBSubnetGroupName.1": dbSubnetGroupName,
  };
}
