import { makeStyles } from "@mui/styles";
import { routeAPIs } from "../routing";
import { NoArgsPathDef } from "../routing/route";

const useStyles = makeStyles({
  container: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, apple color emoji, segoe ui emoji, Segoe UI Symbol, noto color emoji",
    fontSize: 14,
    textAlign: "center",
  },
  title: {
    lineHeight: 1.8,
    fontSize: 24,
  },
  subTitle: {
    lineHeight: 1.6,
    color: "#00000073",
  },
  navigation: {
    marginTop: 24,
    "& button:not(:first-child)": {
      marginLeft: 8,
    },
  },
  btn: {
    color: "#fff",
    borderColor: "#1890ff",
    background: "#1890ff",
    textShadow: "0 -1px 0 rgb(0 0 0 / 12%)",
    boxShadow: "0 2px #0000000b",
    lineHeight: 1.5715,
    display: "inline-block",
    fontWeight: 400,
    border: "1px solid transparent",
    transition: "all .3s cubic-bezier(.645,.045,.355,1)",
    userSelect: "none",
    touchAction: "manipulation",
    height: 32,
    padding: "4px 15px",
    borderRadius: 2,
    cursor: "pointer",
  },
} as const);

const onClickGoHome = new NoArgsPathDef({
  component: () => null,
  pathDef: "/",
}).path().mouseClickNavigationHandler;

const NotFoundComponent = () => {
  const classes = useStyles();
  return (
    <div className={classes.container}>
      <div className={classes.title}>404</div>
      <div className={classes.subTitle}>
        Sorry, the page you visited does not exist.
      </div>
      <div className={classes.navigation}>
        <button className={classes.btn} onClick={routeAPIs.goBack}>
          Back
        </button>
        <button className={classes.btn} onClick={onClickGoHome}>
          Home
        </button>
      </div>
    </div>
  );
};

export default NotFoundComponent;
